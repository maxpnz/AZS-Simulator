import { describe, expect, it, vi } from 'vitest';
import { AudioManager, themeForTime, type SoundEvent } from './AudioManager';
import { GameAudioEvents } from './GameAudioEvents';
import { StationSimulation } from '../game/simulation/StationSimulation';

describe('Sound Update', () => {
  it('pauses local loops with the game and resumes them once',()=>{
    const instances:{paused:boolean;plays:number;volume:number;src:string;loop:boolean;pause:()=>void;play:()=>Promise<void>}[]=[];
    vi.stubGlobal('Audio',class {
      paused=true;plays=0;volume=1;src:string;loop=false;
      constructor(src:string){this.src=src;instances.push(this)}
      pause(){this.paused=true}
      play(){this.paused=false;this.plays++;return Promise.resolve()}
    });
    try{const manager=new AudioManager();manager.startLoop('pump_fueling','car');manager.activate();const pump=instances.find(s=>s.src.includes('pump_fueling'))!;expect(pump.plays).toBe(1);manager.setGamePaused(true);expect(pump.paused).toBe(true);manager.setGamePaused(false);expect(pump.plays).toBe(2);manager.dispose()}finally{vi.unstubAllGlobals()}
  });
  it('keeps one streaming music theme across game-time boundaries', () => {
    for(const seconds of [0,6*3600,18*3600,22*3600,86400+6*3600])expect(themeForTime(seconds)).toBe('Funky_Boxstep_64k');
  });
  it('uses a single streaming track after game-time and suspend/resume changes',()=>{
    const tracks:{src:string;preload:string;loop:boolean;paused:boolean;play:()=>Promise<void>;pause:()=>void;volume:number;currentTime:number}[]=[];
    vi.stubGlobal('Audio',class {
      preload='';loop=false;paused=true;volume=1;currentTime=0;
      constructor(public src:string){tracks.push(this)}
      play(){this.paused=false;return Promise.resolve()}
      pause(){this.paused=true}
    });
    try{const manager=new AudioManager();manager.setGameTime(0);manager.activate();manager.setGameTime(86400);manager.setSuspended(true);manager.setSuspended(false);
      const music=tracks.filter(track=>track.src.includes('/music/'));
      expect(music).toHaveLength(1);expect(music[0]).toMatchObject({preload:'metadata',loop:true,paused:false});manager.dispose();
    }finally{vi.unstubAllGlobals()}
  });
  it('uses defaults for old saves and clamps persisted settings', () => {
    const storage = new Map<string,string>([['azs-simulator-musicVolume','999'],['azs-simulator-effectsVolume','bad']]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}});
    try {
      const manager = new AudioManager();
      expect([manager.getVolume('music'),manager.getVolume('effects'),manager.getVolume('ambient')]).toEqual([100,10,15]);
      manager.setVolume('music',0);
      expect(storage.get('azs-simulator-musicVolume')).toBe('0');
      manager.dispose();
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not replay saved events on rebase and emits fueling transitions once', () => {
    const played: SoundEvent[] = [];
    const started: string[] = [];
    const stopped: string[] = [];
    const manager = {setGameTime:vi.fn(),play:(event:SoundEvent)=>played.push(event),startLoop:(_event:SoundEvent,id:string)=>started.push(id),stopLoop:(_event:SoundEvent,id:string)=>stopped.push(id)} as unknown as AudioManager;
    const bridge = new GameAudioEvents(manager);
    const initial = new StationSimulation().snapshot();
    const vehicle = {id:1,status:'toPump'} as typeof initial.vehicles[number];
    bridge.rebase({...initial,vehicles:[vehicle]});
    bridge.update({...initial,vehicles:[{...vehicle,status:'fueling'}]});
    bridge.update({...initial,vehicles:[{...vehicle,status:'fueling'}]});
    bridge.update({...initial,vehicles:[{...vehicle,status:'finishing'}]});
    bridge.update({...initial,vehicles:[{...vehicle,status:'leaving'}]});
    expect(played).toEqual(['pump_nozzle_pickup','pump_complete','vehicle_start','pump_nozzle_return']);
    expect(started).toEqual(['station','1']);
    expect(stopped).toEqual(['1']);
    bridge.rebase({...initial,vehicles:[vehicle]});
    expect(played).toHaveLength(4);
  });
  it('plays a sale sound only for newly completed goods sales',()=>{
    const played:SoundEvent[]=[];
    const manager={setGameTime:vi.fn(),play:(event:SoundEvent)=>played.push(event),startLoop:vi.fn(),stopLoop:vi.fn(),stopAllLoops:vi.fn()} as unknown as AudioManager;
    const bridge=new GameAudioEvents(manager);
    const initial=new StationSimulation().snapshot();
    bridge.rebase(initial);
    bridge.update({...initial,gameSeconds:initial.gameSeconds+1,financeEvents:[{gameSeconds:initial.gameSeconds+1,kind:'goodsSale',amountKopeks:500}]});
    bridge.update({...initial,gameSeconds:initial.gameSeconds+1,financeEvents:[{gameSeconds:initial.gameSeconds+1,kind:'goodsSale',amountKopeks:500}]});
    expect(played).toEqual(['cash_register']);
  });
  it('limits engine loops to three nearby vehicles and clears them on pause',()=>{
    const instances:{src:string;paused:boolean;play:()=>Promise<void>;pause:()=>void;volume:number;loop:boolean}[]=[];
    vi.stubGlobal('Audio',class {
      paused=true;volume=1;loop=false;preload='';
      constructor(public src:string){instances.push(this)}
      play(){this.paused=false;return Promise.resolve()}
      pause(){this.paused=true}
    });
    try{const manager=new AudioManager();manager.activate();
      manager.syncEngineSounds(Array.from({length:5},(_,id)=>({id,category:id===4?'truck':'sedan',status:'road',speed:1,x:id*20,y:0})));
      expect(instances.filter(sound=>/vehicle_pass|truck_drive/.test(sound.src))).toHaveLength(3);
      manager.setGamePaused(true);
      expect(instances.filter(sound=>/vehicle_pass|truck_drive/.test(sound.src)).every(sound=>sound.paused)).toBe(true);
      manager.dispose();
    }finally{vi.unstubAllGlobals()}
  });
  it('honks after five real seconds of forced road waiting, but not during a queue',()=>{
    let now=1000;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
    const played:SoundEvent[]=[];
    const manager={setGameTime:vi.fn(),play:(event:SoundEvent)=>played.push(event),startLoop:vi.fn(),stopLoop:vi.fn(),stopAllLoops:vi.fn(),syncEngineSounds:vi.fn()} as unknown as AudioManager;
    try{const bridge=new GameAudioEvents(manager),base=new StationSimulation().snapshot();
      const car={...base.vehicles[0],id:91,status:'toPump',x:100,y:685} as typeof base.vehicles[number];
      bridge.rebase({...base,vehicles:[car]});
      bridge.update({...base,vehicles:[car]});
      now=5999;bridge.update({...base,vehicles:[car]});expect(played).not.toContain('vehicle_horn_1');
      now=6001;bridge.update({...base,vehicles:[car]});expect(played).toContain('vehicle_horn_1');
      now=7000;bridge.update({...base,vehicles:[{...car,status:'queued'}]});
      now=26000;bridge.update({...base,vehicles:[{...car,status:'queued'}]});
      expect(played.filter(event=>event.startsWith('vehicle_horn'))).toHaveLength(1);
    }finally{clock.mockRestore()}
  });
  it('imports an existing 0.7.6 save without changing station finances', () => {
    const sim = new StationSimulation();
    const old = sim.exportSave(); old.version = '0.7.6';
    const restored = StationSimulation.importSave(old);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.station.pumps).toEqual(sim.station.pumps);
    expect(restored.exportSave().version).toBe('0.8.2');
  });
});
