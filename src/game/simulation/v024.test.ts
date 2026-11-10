import { describe,expect,it } from 'vitest';
import { StationSimulation } from './StationSimulation';
import { CANOPY_SUPPORTS, PUMP_SLOTS, ROAD_LANES } from '../domain/world';
import { deliveryPose } from '../domain/deliveryMotion';
import { VEHICLE_MODELS } from '../domain/vehicleModels';
import { footprintBlocked } from './collisions';
import { GameEngine } from './GameEngine';
import { createVehicle,RandomSource } from './traffic';

describe('v0.2.4 station systems',()=>{
  it('starts with four legal lanes, five supports, ten positions and two pumps',()=>{
    const sim=new StationSimulation();
    expect(ROAD_LANES).toHaveLength(4);expect(CANOPY_SUPPORTS).toHaveLength(5);
    expect(PUMP_SLOTS).toHaveLength(10);expect(sim.station.pumps.map(p=>p.slot)).toEqual([0,1]);
    expect(new Set(VEHICLE_MODELS.filter(m=>['compact','sedan','crossover','suv','van'].includes(m.category)).map(m=>m.id)).size).toBeGreaterThanOrEqual(10);
  });
  it('builds the third through tenth pump with two crews and a work queue',()=>{
    const sim=new StationSimulation(7);
    for(let slot=2;slot<10;slot++)expect(sim.buildPump(slot)).toBe(true);
    expect(sim.station.pumps).toHaveLength(10);
    expect(sim.station.pumps.filter(p=>p.status==='building')).toHaveLength(8);
    sim.step(1);
    expect(sim.station.jobs?.filter(j=>j.status==='active')).toHaveLength(2);
    expect(sim.station.balanceKopeks).toBe(30_000_000);
    for(let i=0;i<5;i++)sim.step(360);
    expect(sim.station.jobs).toHaveLength(0);
    expect(sim.station.pumps.every(p=>p.status==='ready'||p.status===undefined)).toBe(true);
  });
  it('serializes construction, active traffic and deliveries without duplicate cash or fuel',()=>{
    const sim=new StationSimulation(77);
    expect(sim.buildPump(2)).toBe(true);
    expect(sim.orderDelivery('ai92',200)).toBe(true);
    expect(sim.orderDelivery('ai92',300)).toBe(true);
    for(let i=0;i<240;i++)sim.step(30);
    expect(sim.deliveries).toHaveLength(2);
    expect(sim.deliveries[0].remainingMl).toBe(200_000);
    expect(sim.deliveries[1].status).toBe('waiting');
    const copy=StationSimulation.importSave(sim.exportSave());
    expect(copy.snapshot()).toEqual(sim.snapshot());
    for(let i=0;i<220;i++){sim.step(30);copy.step(30);}
    expect(copy.snapshot()).toEqual(sim.snapshot());
    expect(sim.station.tanks[0].stockMl).toBeLessThanOrEqual(sim.station.tanks[0].capacityMl);
    expect(sim.deliveries).toHaveLength(0);
  });
  it('routes two tankers through one unloading pad without traffic overlap',()=>{
    const sim=new StationSimulation(12345);
    expect(sim.orderDelivery('ai92',200)).toBe(true);
    expect(sim.orderDelivery('ai95',200)).toBe(true);
    const phases=new Set<string>();
    for(let i=0;i<2000;i++){
      sim.step(30);
      const active=sim.deliveries.find(d=>d.status&&d.status!=='enroute'&&d.status!=='waiting');
      if(active){
        phases.add(active.status!);
        const pose=deliveryPose(active);
        const tanker={id:-1,modelId:'fuel-tanker',...pose} as (typeof sim.vehicles)[number];
        expect(footprintBlocked(tanker,pose.x,pose.y,pose.angle,sim.vehicles)).toBe(false);
      }
    }
    expect([...phases]).toEqual(expect.arrayContaining(['approaching','connecting','unloading','disconnecting','leaving']));
    expect(sim.deliveries).toHaveLength(0);
  },30000);
  it('migrates v0.2.3 state and keeps a sale in progress',()=>{
    const sim=new StationSimulation(3);
    const old={version:'0.2.3',state:sim.snapshot()};
    delete old.state.station.jobs;delete old.state.deliveries;
    const restored=StationSimulation.importSave(old);
    expect(restored.station.pumps).toHaveLength(2);
    expect(restored.station.jobs).toEqual([]);
    restored.step(30);
    expect(restored.station.fuels.ai92.stockMl).toBeGreaterThanOrEqual(0);
  });
  it('opens a v0.2.4 save without changing cash, stock or built pumps',()=>{
    const sim=new StationSimulation(11);
    sim.station.balanceKopeks=12_345_678;
    sim.station.tanks[0].stockMl=987_000;
    const old={...sim.exportSave(),version:'0.2.4'};
    const restored=StationSimulation.importSave(old);
    expect(restored.snapshot()).toEqual(sim.snapshot());
    expect(restored.exportSave().version).toBe('0.2.7');
  });
  it('stops a sale at the last millilitre and charges only what was delivered',()=>{
    const sim=new StationSimulation(7);
    sim.station.tanks[0].stockMl=1_000;sim.station.fuels.ai92.stockMl=1_000;
    const v=createVehicle(999,sim.gameSeconds,new RandomSource(3));
    v.status='fueling';v.fuel='ai92';v.pumpId='pump-1';v.route=['pump_1'];v.reservedMl=20_000;
    v.salePriceKopeks=5700;v.setupRemainingSeconds=0;v.currentFuelMl=0;
    sim.vehicles.push(v);
    const cash=sim.station.balanceKopeks;
    sim.step(60);
    expect(sim.station.tanks[0].stockMl).toBe(0);
    expect(sim.stats.soldMl).toBe(1_000);
    expect(sim.station.balanceKopeks-cash).toBe(5_700);
    expect(sim.recentSales[0].volumeMl).toBe(1_000);
    expect(v.status).toBe('finishing');
    sim.step(30);
    expect(sim.stats.purchases).toBe(1);
  });
  it('blocks tank upgrade during service, then pauses connected channels for the job',()=>{
    const sim=new StationSimulation(2);
    const v=createVehicle(999,sim.gameSeconds,new RandomSource(1));v.status='fueling';v.fuel='ai92';v.pumpId='pump-1';v.route=['pump_1'];v.reservedMl=1_000;v.salePriceKopeks=5700;v.setupRemainingSeconds=0;sim.vehicles.push(v);
    expect(sim.upgradeTank('tank-ai92-1')).toBe(false);
    sim.step(60);sim.step(30);sim.vehicles.length=0;
    expect(sim.upgradeTank('tank-ai92-1')).toBe(true);
    expect(sim.station.tanks[0].status).toBe('upgrading');
    sim.step(720);
    expect(sim.station.tanks[0].capacityMl).toBe(5_000_000);
    expect(sim.station.fuels.ai92.capacityMl).toBe(5_000_000);
  });
  it('pauses 10× time exactly and never advances cash during pause',()=>{
    const engine=new GameEngine();const start=engine.getState().gameSeconds;
    engine.setControls(false,10);engine.pulse(0);engine.pulse(50);
    expect(engine.getState().gameSeconds-start).toBe(30);
    const before=engine.getState();engine.setControls(true,10);engine.pulse(1000);
    const after=engine.getState();expect(after.gameSeconds).toBe(before.gameSeconds);
    expect(after.station.balanceKopeks).toBe(before.station.balanceKopeks);
    expect(after.stats.soldMl).toBe(before.stats.soldMl);
  });
  it('avoids overlapping footprints in a dense 10× traffic run',()=>{
    const sim=new StationSimulation(12345);
    let peak=0;
    for(let i=0;i<1000;i++){
      sim.step(30);peak=Math.max(peak,sim.vehicles.length);
      if(i%10===0)for(const vehicle of sim.vehicles){
        expect(footprintBlocked(vehicle,vehicle.x,vehicle.y,vehicle.angle,sim.vehicles.filter(v=>v.id!==vehicle.id))).toBe(false);
      }
    }
    expect(peak).toBeGreaterThanOrEqual(10);
    expect(sim.stats.purchases).toBeGreaterThan(0);
  },30000);
  it('keeps the entrance, queue and exit moving over two game days',()=>{
    const sim=new StationSimulation(12345);
    let lastPurchaseCount=0;
    for(let i=0;i<5760;i++){
      sim.step(30);
      if(i===2880)lastPurchaseCount=sim.stats.purchases;
    }
    expect(sim.stats.purchases).toBeGreaterThan(lastPurchaseCount);
    expect(sim.stats.purchases).toBeGreaterThan(20);
    const ids=sim.vehicles.map(vehicle=>vehicle.id);
    expect(Math.max(...ids)-Math.min(...ids)).toBeLessThan(100);
  },30000);
  it('keeps all ten pumps and the four road lanes live under 10× traffic',()=>{
    for(const seed of [1,77]){
      const sim=new StationSimulation(seed);
      for(let slot=2;slot<10;slot++)expect(sim.buildPump(slot)).toBe(true);
      for(let i=0;i<5760;i++){
        sim.step(30);
        if(i%100===0)for(const vehicle of sim.vehicles)
          expect(footprintBlocked(vehicle,vehicle.x,vehicle.y,vehicle.angle,sim.vehicles.filter(v=>v.id!==vehicle.id))).toBe(false);
      }
      const ids=sim.vehicles.map(vehicle=>vehicle.id);
      expect(Math.max(...ids)-Math.min(...ids)).toBeLessThan(100);
      expect(sim.stats.purchases).toBeGreaterThan(50);
      expect(sim.station.tanks.every(tank=>tank.stockMl>=0&&tank.stockMl<=tank.capacityMl)).toBe(true);
    }
  },30000);
});
