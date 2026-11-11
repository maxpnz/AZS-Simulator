import { describe, expect, it } from 'vitest';
import { cloneLegacyStation } from '../domain/config';
import { StationSimulation } from './StationSimulation';
import { createVehicle, RandomSource } from './traffic';

describe('v0.3 finance and suppliers', () => {
  it('charges an empty station 500 rubles per day and preserves fractions across a save', () => {
    const sim = new StationSimulation();
    const before = sim.station.balanceKopeks;
    sim.step(43_200);
    const restored = StationSimulation.importSave(sim.exportSave());
    restored.step(43_200);
    expect(restored.expenses.lightingKopeks).toBe(50_000);
    expect(restored.expenses.pumpElectricityKopeks).toBe(0);
    expect(restored.expenses.tankMaintenanceKopeks).toBe(0);
    expect(restored.station.balanceKopeks).toBe(before-50_000);
  });

  it('charges built empty tanks and only switched-on pumps', () => {
    const station=cloneLegacyStation();
    for(const tank of station.tanks)tank.stockMl=0;
    for(const fuel of Object.values(station.fuels))fuel.stockMl=0;
    const sim=new StationSimulation(9,station);
    expect(sim.setPumpEnabled('pump-1',false)).toBe(true);
    expect(sim.setPumpEnabled('pump-2',false)).toBe(true);
    sim.step(86_400);
    expect(sim.expenses.lightingKopeks).toBe(50_000);
    expect(sim.expenses.tankMaintenanceKopeks).toBe(16_000);
    expect(sim.expenses.pumpElectricityKopeks).toBe(0);
    expect(sim.setPumpEnabled('pump-1',true)).toBe(true);
    sim.step(86_400);
    expect(sim.expenses.pumpElectricityKopeks).toBe(12_000);
  });

  it('charges exactly 150 rubles to pump one thousand delivered litres', () => {
    const sim=new StationSimulation(5,cloneLegacyStation());
    const car=createVehicle(99,sim.gameSeconds,new RandomSource(5));
    car.status='fueling';car.fuel='ai92';car.pumpId='pump-1';car.route=['pump_1'];car.reservedMl=1_000_000;
    car.tankCapacityMl=1_000_000;car.currentFuelMl=0;car.setupRemainingSeconds=0;car.salePriceKopeks=5700;
    sim.vehicles.push(car);
    sim.step(30_000);
    expect(sim.stats.soldMl).toBe(1_000_000);
    expect(sim.expenses.pumpingKopeks).toBe(15_000);
    expect(sim.expenses.pumpingRemainder).toBe(0);
  });

  it('migrates a sale in progress without charging its past litres twice', () => {
    const sim=new StationSimulation(6,cloneLegacyStation());
    const car=createVehicle(199,sim.gameSeconds,new RandomSource(6));
    car.status='fueling';car.fuel='ai92';car.pumpId='pump-1';car.route=['pump_1'];car.reservedMl=100_000;
    car.salePriceKopeks=5700;car.setupRemainingSeconds=0;
    sim.vehicles.push(car);sim.step(60);
    const raw=sim.exportSave();raw.version='0.2.8';
    raw.state.expenses=undefined;
    raw.state.stats.costKopeks=0;
    delete raw.state.vehicles.find(v=>v.id===199)!.costKopeks;
    const restored=StationSimulation.importSave(raw);
    const cash=restored.station.balanceKopeks;
    const pastCost=restored.vehicles.find(v=>v.id===199)!.costKopeks!;
    expect(restored.stats.costKopeks).toBe(pastCost);
    restored.step(60);
    expect(restored.station.balanceKopeks).toBeGreaterThan(cash);
    expect(restored.stats.costKopeks).toBeGreaterThan(pastCost);
  });

  it('produces the same expense totals at 1x and 10x including a job completion', () => {
    const run=(seconds:number)=>{
      const sim = new StationSimulation(77,cloneLegacyStation());
      expect(sim.upgradePump('pump-1')).toBe(true);
      for(let elapsed=0;elapsed<21_600;elapsed+=seconds)sim.step(seconds);
      return sim.expenses;
    };
    const slow=run(3),fast=run(30);
    expect(fast.lightingKopeks).toBe(slow.lightingKopeks);
    expect(fast.pumpElectricityKopeks).toBe(slow.pumpElectricityKopeks);
    expect(fast.tankMaintenanceKopeks).toBe(slow.tankMaintenanceKopeks);
  },30000);

  it('reserves supplier availability and tank space atomically for three sections', () => {
    const sim = new StationSimulation(10,cloneLegacyStation());
    const ai92=sim.getOffers('ai92').find(o=>o.supplierId==='regional')!;
    expect(ai92.availableLitres).toBeGreaterThan(0);
    expect(sim.orderTrip('regional',{ai92:100,ai95:100,diesel:100})).toBe(false); // no diesel tank
    expect(sim.deliveries).toHaveLength(0);
    expect(sim.orderTrip('regional',{ai92:100,ai95:100})).toBe(true);
    expect(sim.deliveries[0].paidKopeks).toBe(100*ai92.priceKopeks+100*sim.getOffers('ai95').find(o=>o.supplierId==='regional')!.priceKopeks);
    expect(sim.getOffers('ai92').find(o=>o.supplierId==='regional')!.availableLitres).toBe(ai92.availableLitres-100);
    const saved=StationSimulation.importSave(sim.exportSave());
    expect(saved.snapshot()).toEqual(sim.snapshot());
    expect(saved.expenses.purchasesKopeks).toBe(sim.deliveries[0].paidKopeks);
  });

  it('keeps repeated fuel sections separate during unloading', () => {
    const sim=new StationSimulation(11,cloneLegacyStation());
    expect(sim.orderTrip('regional',[{fuel:'ai92',litres:100},{fuel:'ai92',litres:200}])).toBe(true);
    const trip=sim.deliveries[0];
    expect(trip.cargo.ai92).toBe(300_000);
    expect(trip.sections).toHaveLength(2);
    trip.status='unloading';sim.step(30);
    expect(trip.sections?.[0].remainingMl).toBe(82_000);
    expect(trip.sections?.[1].remainingMl).toBe(200_000);
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.snapshot()).toEqual(sim.snapshot());
  });

  it('unloads sections in order, values stock once, and resumes an old partial delivery', () => {
    const sim=new StationSimulation(18,cloneLegacyStation());
    expect(sim.orderTrip('union',{ai92:100,ai95:100})).toBe(true);
    const trip=sim.deliveries[0];trip.status='unloading';
    const ai92Before=sim.station.fuels.ai92.stockMl;
    const ai95Before=sim.station.fuels.ai95.stockMl;
    const valueBefore=sim.expenses.stockValueKopeks.ai92;
    sim.step(30);
    expect(sim.station.fuels.ai92.stockMl).toBe(ai92Before+18_000);
    expect(sim.station.fuels.ai95.stockMl).toBe(ai95Before);
    expect(sim.expenses.stockValueKopeks.ai92).toBeGreaterThan(valueBefore);
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.snapshot()).toEqual(sim.snapshot());
    restored.step(30);
    expect(restored.station.fuels.ai92.stockMl).toBe(ai92Before+36_000);
    expect(restored.expenses.purchasesKopeks).toBe(sim.expenses.purchasesKopeks);

    const old=new StationSimulation(19,cloneLegacyStation());
    expect(old.orderDelivery('ai92',200)).toBe(true);
    old.deliveries[0].status='unloading';old.step(30);
    const oldSave=old.exportSave();oldSave.version='0.2.8';
    delete oldSave.state.deliveries![0].remainingCargo;
    const migrated=StationSimulation.importSave(oldSave);
    expect(migrated.deliveries[0].remainingCargo?.ai92).toBe(old.deliveries[0].remainingMl);
    migrated.step(30);
    expect(migrated.station.fuels.ai92.stockMl).toBe(old.station.fuels.ai92.stockMl+18_000);
  });
});
