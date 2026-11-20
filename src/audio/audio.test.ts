import { describe, expect, it, vi } from 'vitest';
import { AudioManager, themeForTime, type SoundEvent } from './AudioManager';
import { GameAudioEvents } from './GameAudioEvents';
import { StationSimulation } from '../game/simulation/StationSimulation';

describe('Sound Update', () => {
  it('selects themes at all three game-time boundaries, including subsequent days', () => {
    expect(themeForTime(5 * 3600 + 59 * 60)).toBe('midnight_pump_demo');
    expect(themeForTime(6 * 3600)).toBe('morning_fuel_demo');
    expect(themeForTime(18 * 3600)).toBe('golden_hour_station_demo');
    expect(themeForTime(22 * 3600)).toBe('midnight_pump_demo');
    expect(themeForTime(86400 + 6 * 3600)).toBe('morning_fuel_demo');
  });
  it('uses defaults for old saves and clamps persisted settings', () => {
    const storage = new Map<string,string>([['azs-simulator-musicVolume','999'],['azs-simulator-effectsVolume','bad']]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>{storage.set(key,value);}});
    try {
      const manager = new AudioManager();
      expect([manager.getVolume('music'),manager.getVolume('effects'),manager.getVolume('ambient')]).toEqual([100,65,45]);
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
    expect(played).toEqual(['pump_nozzle_pickup','pump_complete','pump_nozzle_return']);
    expect(started).toEqual(['1']);
    expect(stopped).toEqual(['1']);
    bridge.rebase({...initial,vehicles:[vehicle]});
    expect(played).toHaveLength(3);
  });
  it('imports an existing 0.7.6 save without changing station finances', () => {
    const sim = new StationSimulation();
    const old = sim.exportSave(); old.version = '0.7.6';
    const restored = StationSimulation.importSave(old);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.station.pumps).toEqual(sim.station.pumps);
    expect(restored.exportSave().version).toBe('0.8.0');
  });
});
