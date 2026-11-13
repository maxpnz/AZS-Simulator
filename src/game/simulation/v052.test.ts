import { describe,expect,it,vi } from 'vitest';
import { StationSimulation } from './StationSimulation';
import { GameEngine } from './GameEngine';
import { normalizeStationName } from '../domain/stationName';
import { VEHICLE_MODELS } from '../domain/vehicleModels';
import { VEHICLE_SPRITES } from '../../ui/scene/vehicleManifest';

describe('v0.5.2 visual state and assets',()=>{
  it('migrates a 0.5.1 save with its financial and transport state intact',()=>{
    const original=new StationSimulation(421);
    for(let i=0;i<40;i++)original.step(30);
    const raw=original.exportSave();raw.version='0.5.1';
    const restored=StationSimulation.importSave(raw);
    expect(restored.station.name).toBe('АЗС');
    expect(restored.station.balanceKopeks).toBe(original.station.balanceKopeks);
    expect(restored.station.fuels).toEqual(original.station.fuels);
    expect(restored.station.pumps).toEqual(original.station.pumps);
    expect(restored.station.tanks).toEqual(original.station.tanks);
    expect(restored.vehicles).toEqual(original.vehicles);
    expect(restored.queueIds).toEqual(original.queueIds);
  });
  it('backs up the original 0.5.1 save before the first 0.5.2 write',()=>{
    const old={...new StationSimulation(5).exportSave(),version:'0.5.1'};
    const original=JSON.stringify(old),storage=new Map([['azs-simulator-save',original]]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
    try{
      const engine=new GameEngine();engine.save();
      expect(storage.get('azs-simulator-save-v051-backup')).toBe(original);
      expect(JSON.parse(storage.get('azs-simulator-save')!).version).toBe('0.5.2');
    }finally{vi.unstubAllGlobals();}
  });
  it('limits a station name by grapheme and persists Cyrillic text',()=>{
    expect(normalizeStationName('  ')).toBe('АЗС');
    expect(normalizeStationName(' Северная АЗС! ')).toBe('Северная АЗС!');
    expect(Array.from(normalizeStationName('Ш'.repeat(21)))).toHaveLength(20);
    const sim=new StationSimulation(1);
    sim.setStationName('  АЗС Северная  ');
    expect(StationSimulation.importSave(sim.exportSave()).station.name).toBe('АЗС Северная');
  });
  it('maps every model to its own right-facing texture',()=>{
    expect(VEHICLE_SPRITES).toHaveLength(17);
    expect(new Set(VEHICLE_SPRITES.map(sprite=>sprite.path)).size).toBe(17);
    expect(new Set(VEHICLE_SPRITES.map(sprite=>sprite.modelId))).toEqual(new Set(VEHICLE_MODELS.map(model=>model.id)));
    for(const sprite of VEHICLE_SPRITES){
      expect(sprite.orientation).toBe('right');
      expect(sprite.pixelWidth).toBeGreaterThan(0);
      expect(sprite.pixelHeight).toBeGreaterThan(0);
    }
  });
});
