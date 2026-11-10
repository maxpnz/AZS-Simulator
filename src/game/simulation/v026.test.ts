import { describe, expect, it } from 'vitest';
import { INITIAL_STATION } from '../domain/config';
import { DELIVERY_PAD, FUEL_HATCH_SIZE, PUMP_ISLANDS, TANK_PAD, connectedPumpChannels, pumpNozzlePoint, vehicleFillerPoint } from '../domain/stationGeometry';
import { modelById, VEHICLE_MODELS } from '../domain/vehicleModels';
import { CANOPY_SUPPORTS, metres, PUMP_SLOTS } from '../domain/world';
import { StationSimulation } from './StationSimulation';

describe('v0.2.6 world geometry and rendering data',()=>{
  it('keeps five separate islands, ten symmetric mounts and a clear unloading pad',()=>{
    expect(PUMP_ISLANDS).toHaveLength(5);
    expect(PUMP_SLOTS).toHaveLength(10);
    CANOPY_SUPPORTS.forEach((support,index)=>{
      const [left,right]=PUMP_SLOTS.slice(index*2,index*2+2);
      expect(left.x+right.x).toBe(support*2);
      expect(left.stopX+right.stopX).toBe(support*2);
      expect(right.stopX-left.stopX).toBeGreaterThan(metres(modelById('full-suv').length)*1.5);
      expect(PUMP_ISLANDS[index].x).toBe(support);
    });
    expect(TANK_PAD.x+TANK_PAD.width).toBeLessThan(DELIVERY_PAD.x);
    expect(FUEL_HATCH_SIZE).toBeLessThan(metres(modelById('city-hatch').length));
  });
  it('anchors every model at its center and connects fuel at the outer rear body edge',()=>{
    for(const model of VEHICLE_MODELS){
      const pose={modelId:model.id,x:500,y:600,angle:0};
      const cap=vehicleFillerPoint(pose);
      expect(cap.x).toBeGreaterThan(500-metres(model.length)/2);
      expect(cap.x).toBeLessThan(500);
      expect(cap.y).toBeLessThan(600);
      const turned=vehicleFillerPoint({...pose,angle:Math.PI/2});
      expect(turned.x).toBeCloseTo(500-metres(model.filler.y));
      expect(turned.y).toBeCloseTo(600+metres(model.filler.x));
    }
  });
  it('exposes only configured nozzles and marks an empty channel independently',()=>{
    const pump=INITIAL_STATION.pumps[0];
    const stock={...Object.fromEntries(Object.keys(INITIAL_STATION.fuels).map(f=>[f,0])),ai95:500_000} as Record<keyof typeof INITIAL_STATION.fuels,number>;
    const channels=connectedPumpChannels(pump,stock);
    expect(channels).toEqual([{fuel:'ai92',label:'92',available:false},{fuel:'ai95',label:'95',available:true}]);
    expect(pumpNozzlePoint(pump,'ai92')).not.toEqual(pumpNozzlePoint(pump,'ai95'));
    expect(pumpNozzlePoint(pump,'diesel')).toBeNull();
  });
  it('loads a v0.2.5 traffic save and continues sales with the new routes',()=>{
    const sim=new StationSimulation(77);
    for(let i=0;i<300;i++)sim.step(30);
    const old={...sim.exportSave(),version:'0.2.5'};
    const restored=StationSimulation.importSave(old);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.stats).toEqual(sim.stats);
    expect(restored.vehicles).toHaveLength(sim.vehicles.length);
    for(let i=0;i<600;i++)restored.step(30);
    expect(restored.stats.purchases).toBeGreaterThan(sim.stats.purchases);
    expect(restored.exportSave().version).toBe('0.2.6');
  });
  it('moves an old stationary customer onto the matching new stop without changing its sale',()=>{
    const sim=new StationSimulation(31);
    for(let i=0;i<300&&!sim.vehicles.some(v=>v.status==='fueling');i++)sim.step(30);
    const saved=sim.exportSave();
    const customer=saved.state.vehicles.find(v=>v.status==='fueling');
    expect(customer).toBeDefined();
    customer!.x+=30;customer!.angle=-Math.PI/2;
    saved.version='0.2.5';
    const restored=StationSimulation.importSave(saved);
    const migrated=restored.vehicles.find(v=>v.id===customer!.id)!;
    const slot=restored.station.pumps.find(p=>p.id===customer!.pumpId)!.slot;
    expect(migrated.x).toBe(PUMP_SLOTS[slot].stopX);
    expect(migrated.y).toBe(PUMP_SLOTS[slot].stopY);
    expect(migrated.angle).toBe(0);
    expect(migrated.deliveredMl).toBe(customer!.deliveredMl);
  });
  it('can fuel more than one car at once without intersecting adjacent island routes',()=>{
    const sim=new StationSimulation(19);
    sim.buildPump(2);sim.buildPump(3);
    let peak=0;
    for(let i=0;i<1000;i++){
      sim.step(30);
      peak=Math.max(peak,sim.vehicles.filter(v=>v.status==='fueling').length);
    }
    expect(peak).toBeGreaterThanOrEqual(2);
  });
});
