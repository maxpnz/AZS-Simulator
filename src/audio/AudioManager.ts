import { getHour } from '../game/simulation/time';

export type AudioBus = 'music' | 'effects' | 'ambient';
export type SoundEvent = 'cash_register' | 'pump_complete' | 'pump_nozzle_pickup' | 'pump_nozzle_return' | 'repair_complete' | 'ui_click' | 'ui_confirm' | 'ui_error' | 'ui_notification' | 'ui_purchase' | 'ui_warning' | 'pump_fueling' | 'repair_tools' | 'vehicle_start' | 'vehicle_idle' | 'vehicle_pass' | 'vehicle_stop' | 'truck_arrival' | 'truck_brake' | 'fuel_unloading' | 'goods_unloading' | 'store_door' | 'cafe_door' | 'ambient_station';
export type Theme = 'morning_fuel_demo' | 'golden_hour_station_demo' | 'midnight_pump_demo';
const available = new Set<SoundEvent>(['cash_register','pump_complete','pump_nozzle_pickup','pump_nozzle_return','repair_complete','ui_click','ui_confirm','ui_error','ui_notification','ui_purchase','ui_warning']);
const defaults: Record<AudioBus, number> = { music: 35, effects: 65, ambient: 45 };
const storageKey = (bus: AudioBus) => `azs-simulator-${bus}Volume`;
const clamp = (value: number, fallback: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : fallback;
export function themeForTime(seconds: number): Theme {
  const hour = getHour(seconds);
  return hour >= 6 && hour < 18 ? 'morning_fuel_demo' : hour >= 18 && hour < 22 ? 'golden_hour_station_demo' : 'midnight_pump_demo';
}
export class AudioManager {
  private volumes: Record<AudioBus, number> = { ...defaults };
  private enabled = false;
  private suspended = false;
  private music = new Map<Theme, HTMLAudioElement>();
  private current: Theme | undefined;
  private wanted: Theme = 'morning_fuel_demo';
  private fadeId = 0;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private effects = new Map<SoundEvent, HTMLAudioElement[]>();
  private effectGains = new WeakMap<HTMLAudioElement, number>();
  private lastPlayed = new Map<SoundEvent, number>();
  private warned = new Set<SoundEvent>();
  private loops = new Map<string, HTMLAudioElement>();
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
  setCamera(camera: { scale: number; x: number; y: number; width: number; height: number }): void { this.camera = camera; }
  setGameTime(seconds: number): void {
    this.wanted = themeForTime(seconds);
    if (this.enabled && !this.suspended && this.wanted !== this.current) this.switchTheme(this.wanted);
  }
  activate(): void {
    if (this.enabled) return;
    this.enabled = true;
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
      for (const sound of this.loops.values()) void sound.play().catch(() => {});
    }
  }
  play(event: SoundEvent, context?: { gain?: number; position?: { x: number; y: number } }): void {
    if (!available.has(event)) { this.warnMissing(event); return; }
    if (!this.enabled || this.suspended) return;
    const now = performance.now();
    const cooldown = event === 'ui_click' ? 90 : event === 'cash_register' ? 180 : 0;
    if (now - (this.lastPlayed.get(event) ?? -Infinity) < cooldown) return;
    this.lastPlayed.set(event, now);
    let pool = this.effects.get(event);
    if (!pool) { pool = []; this.effects.set(event, pool); }
    let sound = pool.find(item => item.paused || item.ended);
    if (!sound && pool.length < (event.startsWith('ui_') ? 3 : 4)) {
      sound = new Audio(`/audio/sfx/${event}.wav`); sound.preload = 'auto'; pool.push(sound);
    }
    if (!sound) return;
    let gain = context?.gain ?? 1;
    if (context?.position && this.camera) {
      const { scale, x, y, width, height } = this.camera;
      const screenX = context.position.x * scale + x, screenY = context.position.y * scale + y;
      const distance = Math.hypot((screenX - width / 2) / Math.max(width, 1), (screenY - height / 2) / Math.max(height, 1));
      gain *= Math.max(.2, 1 - distance);
    }
    this.effectGains.set(sound, Math.max(0, Math.min(1, gain)));
    sound.volume = this.volumes.effects / 100 * this.effectGains.get(sound)!;
    sound.currentTime = 0;
    void sound.play().catch(() => {});
  }
  startLoop(event: SoundEvent, entityId: string): void {
    if (!available.has(event)) { this.warnMissing(event); return; }
    const key = `${event}:${entityId}`;
    if (this.loops.has(key)) return;
    const sound = new Audio(`/audio/sfx/${event}.wav`);
    sound.loop = true; sound.volume = this.volumes.ambient / 100;
    this.loops.set(key, sound);
    if (this.enabled && !this.suspended) void sound.play().catch(() => {});
  }
  stopLoop(event: SoundEvent, entityId: string): void {
    const key = `${event}:${entityId}`, sound = this.loops.get(key);
    if (sound) { sound.pause(); sound.src = ''; this.loops.delete(key); }
  }
  private warnMissing(event: SoundEvent): void {
    if (this.warned.has(event)) return;
    this.warned.add(event);
    if (import.meta.env.DEV) console.warn(`[AZS audio] Asset unavailable: ${event}`);
  }
  private track(theme: Theme): HTMLAudioElement {
    let track = this.music.get(theme);
    if (!track) { track = new Audio(`/audio/music/${theme}.ogg`); track.loop = true; track.preload = 'auto'; this.music.set(theme, track); }
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
    for (const pool of this.effects.values()) for (const sound of pool) sound.volume = this.volumes.effects / 100 * (this.effectGains.get(sound) ?? 1);
    for (const sound of this.loops.values()) sound.volume = this.volumes.ambient / 100;
  }
  dispose(): void {
    this.stopFade();
    if (typeof window !== 'undefined') (window as Window & {AZSAudioFocus?:{release:()=>void}}).AZSAudioFocus?.release();
    for (const track of this.music.values()) { track.pause(); track.src = ''; }
    for (const pool of this.effects.values()) for (const sound of pool) { sound.pause(); sound.src = ''; }
    for (const sound of this.loops.values()) { sound.pause(); sound.src = ''; }
    this.music.clear(); this.effects.clear(); this.loops.clear(); this.enabled = false;
  }
}
export const audio = new AudioManager();
