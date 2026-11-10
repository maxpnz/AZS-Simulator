import { describe,expect,it } from 'vitest';
import { FUEL_IDS, INITIAL_STATION, TRAFFIC_CONFIG } from '../domain/config';
import { StationSimulation } from './StationSimulation';
import { createVehicle, purchaseLimitMl, RandomSource } from './traffic';

describe('v0.2.3 routes, queue and timed fuel sales',()=>{
  it('drives and sells deterministically over two game days without creating fuel or cash',()=>{
    const first=new StationSimulation(12345);
    const second=new StationSimulation(12345);
    let sawPump1=false,sawPump2=false,sawDiesel=false,sawPremium=false,sawQueue=false,sawFuelingProgress=false;
    let previous=new Map<number,{x:number;y:number}>();
    for(let i=0;i<5760;i++) {
      first.step(30);second.step(30);
      if(first.queueIds.length>0) sawQueue=true;
      const active=new Map<number,{x:number;y:number}>();
      for(const vehicle of first.vehicles) {
        active.set(vehicle.id,{x:vehicle.x,y:vehicle.y});
        expect(vehicle.x).toBeGreaterThanOrEqual(0);expect(vehicle.x).toBeLessThanOrEqual(2000);
        expect(vehicle.y).toBeGreaterThanOrEqual(0);expect(vehicle.y).toBeLessThanOrEqual(1200);
        const before=previous.get(vehicle.id);
        if(before) expect(Math.hypot(vehicle.x-before.x,vehicle.y-before.y)).toBeLessThanOrEqual(TRAFFIC_CONFIG.roadSpeed*30+.01);
        expect(vehicle.deliveredMl).toBeLessThanOrEqual(vehicle.reservedMl);
        expect(vehicle.currentFuelMl+vehicle.deliveredMl).toBeLessThanOrEqual(vehicle.tankCapacityMl);
        if(vehicle.status==='fueling'&&vehicle.deliveredMl>0) {
          sawFuelingProgress=true;
          expect(vehicle.chargedKopeks).toBe(Math.round(vehicle.deliveredMl*vehicle.salePriceKopeks/1000));
        }
        if(vehicle.status!=='road'&&((vehicle.x>=700&&vehicle.x<=900)||(vehicle.x>=1250&&vehicle.x<=1450)))
          expect(vehicle.y).toBeGreaterThanOrEqual(575);
        if(vehicle.status!=='road'&&vehicle.status!=='leaving') expect(vehicle.laneId).toBe('east_lane_1');
        if(vehicle.pumpId==='pump-1') sawPump1=true;
        if(vehicle.pumpId==='pump-2') sawPump2=true;
        if(vehicle.fuel==='diesel') sawDiesel=true;
        if(['ai95plus','ai98','ai100'].includes(vehicle.fuel)) sawPremium=true;
      }
      previous=active;
      for(const id of FUEL_IDS) expect(first.station.fuels[id].stockMl).toBeGreaterThanOrEqual(0);
      for(const tank of first.station.tanks) {
        expect(tank.stockMl).toBe(first.station.fuels[tank.fuel].stockMl);
        expect(tank.stockMl).toBeLessThanOrEqual(tank.capacityMl);
      }
    }
    expect(first.stats.passed).toBeGreaterThan(0);
    expect(first.stats.visited).toBeGreaterThan(0);
    expect(first.stats.purchases).toBeGreaterThan(0);
    expect(first.stats.leftQueue).toBeGreaterThan(0);
    expect(sawPump1&&sawPump2&&sawDiesel&&sawPremium&&sawQueue&&sawFuelingProgress).toBe(true);
    const used=FUEL_IDS.reduce((sum,id)=>sum+INITIAL_STATION.fuels[id].stockMl-first.station.fuels[id].stockMl,0);
    expect(used).toBe(first.stats.soldMl);
    expect(first.station.balanceKopeks-INITIAL_STATION.balanceKopeks).toBe(first.stats.revenueKopeks);
    expect(first.snapshot()).toEqual(second.snapshot());
  },30000);
  it('limits purchase by tank, budget and available stock',()=>{
    const vehicle=createVehicle(1,0,new RandomSource(7));
    vehicle.behavior='volume';vehicle.requestedMl=40_000;
    vehicle.tankCapacityMl=50_000;vehicle.currentFuelMl=20_000;vehicle.budgetKopeks=100_000;
    expect(purchaseLimitMl(vehicle,5000,50_000)).toBe(20_000);
    expect(purchaseLimitMl(vehicle,5000,10_000)).toBe(10_000);
    expect(purchaseLimitMl(vehicle,5000,50_000)).toBeLessThanOrEqual(vehicle.tankCapacityMl-vehicle.currentFuelMl);
  });
  it('blocks changing a dispenser while it serves a vehicle',()=>{
    const sim=new StationSimulation(12345);
    let occupied=false;
    for(let i=0;i<3000&&!occupied;i++) {
      sim.step(30);
      occupied=sim.vehicles.some((vehicle)=>vehicle.pumpId==='pump-1');
    }
    expect(occupied).toBe(true);
    expect(sim.setPumpFuels('pump-1',['ai100'])).toBe(false);
    expect(sim.setRetailPrice('ai92',6200)).toBe(true);
    expect(sim.station.fuels.ai92.retailKopeks).toBe(6200);
  });
  it('keeps the quoted price for a customer already assigned to a pump',()=>{
    const sim=new StationSimulation(12345);
    let customer=sim.vehicles.find((vehicle)=>vehicle.pumpId&&vehicle.reservedMl>0);
    for(let i=0;i<3000&&!customer;i++) {
      sim.step(30);
      customer=sim.vehicles.find((vehicle)=>vehicle.pumpId&&vehicle.reservedMl>0);
    }
    expect(customer).toBeDefined();
    const {id,fuel,reservedMl,salePriceKopeks}=customer!;
    expect(sim.setRetailPrice(fuel,salePriceKopeks+500)).toBe(true);
    for(let i=0;i<3000&&!sim.recentSales.some((sale)=>sale.vehicleId===id);i++) sim.step(30);
    const sale=sim.recentSales.find((entry)=>entry.vehicleId===id);
    expect(sale).toBeDefined();
    expect(sale!.volumeMl).toBe(reservedMl);
    expect(sale!.revenueKopeks).toBe(Math.round(reservedMl*salePriceKopeks/1000));
  });
  it('spends game time in proportion to delivered litres and posts cash progressively',()=>{
    const sim=new StationSimulation(7);
    const start=sim.gameSeconds;
    for(const [index,volume] of [10_000,20_000].entries()) {
      const vehicle=createVehicle(10_000+index,start,new RandomSource(20+index));
      vehicle.fuel='ai92';vehicle.tankCapacityMl=100_000;vehicle.currentFuelMl=0;
      vehicle.status='fueling';vehicle.pumpId='pump-'+(index+1);
      vehicle.route=['pump_'+(index+1)];vehicle.reservedMl=volume;
      vehicle.salePriceKopeks=5700;vehicle.setupRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds;
      vehicle.budgetKopeks=200_000;
      sim.vehicles.push(vehicle);
    }
    sim.step(TRAFFIC_CONFIG.serviceSetupSeconds+60);
    expect(sim.station.tanks[0].stockMl).toBeLessThan(INITIAL_STATION.tanks[0].stockMl);
    expect(sim.station.tanks[0].stockMl).toBeGreaterThan(INITIAL_STATION.tanks[0].stockMl-30_000);
    expect(sim.station.balanceKopeks).toBeGreaterThan(INITIAL_STATION.balanceKopeks);
    for(let i=0;i<1000&&sim.recentSales.filter((sale)=>sale.vehicleId>=10_000).length<2;i++) sim.step(1);
    const small=sim.recentSales.find((sale)=>sale.vehicleId===10_000)!;
    const large=sim.recentSales.find((sale)=>sale.vehicleId===10_001)!;
    expect(small.volumeMl).toBe(10_000);expect(large.volumeMl).toBe(20_000);
    const smallFlow=small.gameSeconds-start-TRAFFIC_CONFIG.serviceSetupSeconds;
    const largeFlow=large.gameSeconds-start-TRAFFIC_CONFIG.serviceSetupSeconds;
    expect(largeFlow).toBeCloseTo(smallFlow*2,-1);
  });
});
