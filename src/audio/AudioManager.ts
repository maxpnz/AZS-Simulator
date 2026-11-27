export type AudioBus = 'music' | 'effects' | 'ambient' | 'cars' | 'trucks' | 'notifications';
export type SoundEvent = 'cash_register' | 'pump_complete' | 'pump_nozzle_pickup' | 'pump_nozzle_return' | 'repair_complete' | 'ui_select' | 'ui_open' | 'ui_close' | 'construction' | 'upgrade_complete' | 'ui_click' | 'ui_confirm' | 'ui_error' | 'ui_notification' | 'ui_purchase' | 'ui_warning' | 'pump_fueling' | 'repair_tools' | 'vehicle_start' | 'vehicle_idle' | 'vehicle_pass' | 'vehicle_stop' | 'vehicle_horn_1' | 'vehicle_horn_2' | 'truck_arrival' | 'truck_brake' | 'truck_idle' | 'truck_drive' | 'fuel_unloading' | 'goods_unloading' | 'store_door' | 'cafe_door' | 'ambient_station';
export type Theme = 'Funky_Boxstep_64k';
const available = new Set<SoundEvent>(['ui_select','ui_open','ui_close','construction','upgrade_complete','cash_register','pump_complete','pump_nozzle_pickup','pump_nozzle_return','repair_complete','ui_click','ui_confirm','ui_error','ui_notification','ui_purchase','ui_warning','pump_fueling','repair_tools','vehicle_start','vehicle_idle','vehicle_pass','vehicle_stop','vehicle_horn_1','vehicle_horn_2','truck_arrival','truck_brake','truck_idle','truck_drive','fuel_unloading','goods_unloading','store_door','cafe_door','ambient_station']);
const defaults: Record<AudioBus, number> = { music: 65, effects: 10, ambient: 15, cars: 20, trucks: 25, notifications: 20 };
const soundBus=(event:SoundEvent):AudioBus=>event.startsWith('truck_')?'trucks':event.startsWith('vehicle_')?'cars':event==='cash_register'||event==='ui_notification'||event==='ui_warning'?'notifications':event.startsWith('ui_')?'effects':'ambient';
const storageKey = (bus: AudioBus) => `azs-simulator-${bus}Volume`;
const clamp = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
export function themeForTime(_seconds: number): Theme {
  return 'Funky_Boxstep_64k';
}
export class AudioManager {
  private volumes: Record<AudioBus, number> = { ...defaults };
  private enabled = false;
  private suspended = false;
  private gamePaused = false;
  private music = new Map<Theme, HTMLAudioElement>();
  private current: Theme | undefined;
  private wanted: Theme = 'Funky_Boxstep_64k';
  private fadeId = 0;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private effects = new Map<SoundEvent, HTMLAudioElement[]>();
  private effectGains = new WeakMap<HTMLAudioElement, number>();
  private lastPlayed = new Map<SoundEvent, number>();
  private warned = new Set<SoundEvent>();
  private loops = new Map<string, HTMLAudioElement>();
  private engineLoops = new Map<string,SoundEvent>();
  private loopPositions = new Map<string, { x: number; y: number }>();
  private modalOpen = false;
  private camera: { scale: number; x: number; y: number; width: number; height: number } | undefined;
  private fadeProgress = 1;
  private fadePreviousStart = 1;
  constructor() {
    if (typeof localStorage !== 'undefined') for (const bus of Object.keys(defaults) as AudioBus[]) {
      try { const raw = localStorage.getItem(storageKey(bus)); if (raw !== null) this.volumes[bus] = clamp(Number(raw), defaults[bus]); } catch { /* storage unavailable */ }
    }
  }
  getVolume(bus: AudioBus): number { return this.volumes[bus]; }
  setVolume(bus: AudioBus, value: number): void {
    this.volumes[bus] = clamp(value, defaults[bus]);
    try { localStorage.setItem(storageKey(bus), String(this.volumes[bus])); } catch { /* storage unavailable */ }
    this.updateVolumes();
  }
  setModalOpen(open: boolean): void { this.modalOpen = open; this.updateVolumes(); }
  setGamePaused(paused:boolean):void {
    if(this.gamePaused===paused)return;
    this.gamePaused=paused;
    for(const sound of this.loops.values())if(paused)sound.pause();else if(this.enabled&&!this.suspended)void sound.play().catch(()=>{});
  }
  setCamera(camera: { scale: number; x: number; y: number; width: number; height: number }): void { this.camera = camera; this.updateVolumes(); }
  private spatialGain(position?: {x:number;y:number}):number {
    if(!position||!this.camera)return 1;
    const {scale,x,y,width,height}=this.camera;
    const distance=Math.hypot((position.x*scale+x-width/2)/Math.max(width,1),(position.y*scale+y-height/2)/Math.max(height,1));
    return Math.max(.08,Math.min(1,1-distance*.9))*Math.min(1,scale/1.1);
  }
  setGameTime(seconds: number): void {
    this.wanted = themeForTime(seconds);
    if (this.enabled && !this.suspended && this.wanted !== this.current) this.switchTheme(this.wanted);
  }
  activate(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.startLoop('ambient_station','station');
    for(const sound of this.loops.values())if(!this.suspended&&!this.gamePaused)void sound.play().catch(()=>{});
    if (typeof window !== 'undefined') (window as Window & {AZSAudioFocus?:{acquire:()=>void}}).AZSAudioFocus?.acquire();
    if (!this.suspended) this.switchTheme(this.wanted);
  }
  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) {
      this.stopFade();
      for (const track of this.music.values()) track.pause();
      for (const pool of this.effects.values()) for (const sound of pool) sound.pause();
      for (const sound of this.loops.values()) sound.pause();
    } else if (this.enabled) {
      if (this.current !== this.wanted) this.switchTheme(this.wanted);
      else if (this.current) { const track = this.music.get(this.current); if (track) { track.volume = this.musicGain(); void track.play().catch(() => {}); } }
      if(!this.gamePaused)for (const sound of this.loops.values()) void sound.play().catch(() => {});
    }
  }
  play(event: SoundEvent, context?: { gain?: number; position?: { x: number; y: number } }): void {
    if (!available.has(event)) { this.warnMissing(event); return; }
    if (!this.enabled || this.suspended || this.gamePaused&&!event.startsWith('ui_')) return;
    const now = performance.now();
    const cooldown = event.startsWith('ui_') ? 120 : event === 'cash_register' ? 350 : event.startsWith('vehicle_horn')?1500:0;
    if (now - (this.lastPlayed.get(event) ?? -Infinity) < cooldown) return;
    this.lastPlayed.set(event, now);
    let pool = this.effects.get(event);
    if (!pool) { pool = []; this.effects.set(event, pool); }
    let sound = pool.find(item => item.paused || item.ended);
    const allocated=[...this.effects.values()].reduce((sum,items)=>sum+items.length,0);
    if (!sound && allocated < 16 && pool.length < (event.startsWith('ui_') ? 3 : 4)) {
      sound = new Audio(`/audio/sfx/${event}.ogg`); sound.preload = 'metadata'; pool.push(sound);
    }
    if (!sound) return;
    let gain = context?.gain ?? 1;
    gain *= this.spatialGain(context?.position);
    this.effectGains.set(sound, Math.max(0, Math.min(1, gain)));
    sound.volume = this.volumes[soundBus(event)] / 100 * this.effectGains.get(sound)!;
    sound.currentTime = 0;
    void sound.play().catch(() => {});
  }
  startLoop(event: SoundEvent, entityId: string, position?:{x:number;y:number}): void {
    if (!available.has(event)) { this.warnMissing(event); return; }
    const key = `${event}:${entityId}`;
    if(position)this.loopPositions.set(key,position);
    if (this.loops.has(key)) {this.updateVolumes();return;}
    if(this.loops.size>=12)return;
    const sound = new Audio(`/audio/sfx/${event}.ogg`);
    sound.loop = true; sound.volume = this.volumes[soundBus(event)] / 100*this.spatialGain(position);
    this.loops.set(key, sound);
    if (this.enabled && !this.suspended && !this.gamePaused) void sound.play().catch(() => {});
  }
  stopLoop(event: SoundEvent, entityId: string): void {
    const key = `${event}:${entityId}`, sound = this.loops.get(key);
    if (sound) { sound.pause(); sound.src = ''; this.loops.delete(key); }
    this.loopPositions.delete(key);
  }
  stopAllLoops():void {for(const key of [...this.loops.keys()]){const [event,...parts]=key.split(':');this.stopLoop(event as SoundEvent,parts.join(':'));}this.engineLoops.clear();}
  syncEngineSounds(vehicles:readonly {id:number;category:string;status:string;speed?:number;x:number;y:number}[]):void {
    const candidates=vehicles.filter(v=>!['fueling','finishing','parked'].includes(v.status))
      .map(v=>({vehicle:v,gain:this.spatialGain(v)})).sort((a,b)=>b.gain-a.gain).slice(0,3);
    const wanted=new Set<string>();
    for(const {vehicle} of candidates){
      const id=String(vehicle.id),truck=vehicle.category==='truck';
      const moving=(vehicle.speed??0)>.5;
      const event:SoundEvent=truck?(moving?'truck_drive':'truck_idle'):(moving?'vehicle_pass':'vehicle_idle');
      wanted.add(id);
      const previous=this.engineLoops.get(id);
      if(previous&&previous!==event)this.stopLoop(previous,id);
      this.engineLoops.set(id,event);
      this.startLoop(event,id,vehicle);
    }
    for(const [id,event] of this.engineLoops)if(!wanted.has(id)){this.stopLoop(event,id);this.engineLoops.delete(id);}
  }
  private warnMissing(event: SoundEvent): void {
    if (this.warned.has(event)) return;
    this.warned.add(event);
    if (import.meta.env.DEV) console.warn(`[AZS audio] Asset unavailable: ${event}`);
  }
  private track(theme: Theme): HTMLAudioElement {
    let track = this.music.get(theme);
    if (!track) { track = new Audio(`/audio/music/${theme}.ogg`); track.loop = true; track.preload = 'metadata'; this.music.set(theme, track); }
    return track;
  }
  private musicGain(): number { return this.volumes.music / 100 * (this.modalOpen ? .82 : 1); }
  private stopFade(): void { this.fadeId++; if (this.fadeTimer) clearInterval(this.fadeTimer); this.fadeTimer = undefined; }
  private switchTheme(theme: Theme): void {
    this.stopFade();
    const previous = this.current ? this.music.get(this.current) : undefined;
    for (const track of this.music.values()) if (track !== previous) track.pause();
    const next = this.track(theme);
    this.fadePreviousStart = previous && this.musicGain() > 0 ? previous.volume / this.musicGain() : 1;
    this.current = theme;
    this.fadeProgress = previous ? 0 : 1;
    next.currentTime = 0;
    next.volume = previous ? 0 : this.musicGain();
    void next.play().catch(() => {});
    if (!previous || previous === next) return;
    const id = this.fadeId, started = performance.now();
    this.fadeTimer = setInterval(() => {
      if (id !== this.fadeId) return;
      const progress = Math.min(1, (performance.now() - started) / 3000);
      this.fadeProgress = progress;
      previous.volume = this.musicGain() * this.fadePreviousStart * (1 - progress);
      next.volume = this.musicGain() * progress;
      if (progress === 1) { previous.pause(); previous.currentTime = 0; this.stopFade(); }
    }, 50);
  }
  private updateVolumes(): void {
    if (this.current) {
      this.track(this.current).volume = this.musicGain() * this.fadeProgress;
      if (this.fadeTimer) for (const [theme,track] of this.music) if (theme !== this.current && !track.paused) track.volume = this.musicGain() * this.fadePreviousStart * (1-this.fadeProgress);
    }
    for (const [event,pool] of this.effects) for (const sound of pool) sound.volume = this.volumes[soundBus(event)] / 100 * (this.effectGains.get(sound) ?? 1);
    for (const [key,sound] of this.loops){
      const bus=soundBus(key.split(':')[0] as SoundEvent);
      sound.volume=this.volumes[bus]/100*this.spatialGain(this.loopPositions.get(key))*(this.modalOpen?.5:1);
      if(sound.volume===0)sound.pause();
      else if(sound.paused&&this.enabled&&!this.suspended&&!this.gamePaused)void sound.play().catch(()=>{});
    }
  }
  dispose(): void {
    this.stopFade();
    if (typeof window !== 'undefined') (window as Window & {AZSAudioFocus?:{release:()=>void}}).AZSAudioFocus?.release();
    for (const track of this.music.values()) { track.pause(); track.src = ''; }
    for (const pool of this.effects.values()) for (const sound of pool) { sound.pause(); sound.src = ''; }
    for (const sound of this.loops.values()) { sound.pause(); sound.src = ''; }
    this.music.clear(); this.effects.clear(); this.loops.clear(); this.loopPositions.clear();this.engineLoops.clear(); this.enabled = false;
  }
}
export const audio = new AudioManager();
