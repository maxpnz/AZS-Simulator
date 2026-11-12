import { describe, expect, it } from 'vitest';
import { cloneLegacyStation } from '../domain/config';
import { advanceMarket, createMarket, SUPPLIERS } from '../domain/market';
import { StationSimulation } from './StationSimulation';
import { getTrafficMultiplier } from './time';

const HOUR=3600;
describe('v0.4 market and demand',()=>{
  it('offers seven independent suppliers with configured specialties',()=>{
    const sim=new StationSimulation(10,cloneLegacyStation());
    expect(SUPPLIERS).toHaveLength(8);
    expect(new Set(SUPPLIERS.map(s=>s.id)).size).toBe(8);
    expect(sim.getOffers('diesel').find(o=>o.supplierId==='north')!.priceKopeks)
      .toBeLessThan(sim.getOffers('diesel').find(o=>o.supplierId==='regional')!.priceKopeks);
    expect(sim.getOffers('ai98').find(o=>o.supplierId==='prime')!.priceKopeks)
      .toBeLessThan(sim.getOffers('ai98').find(o=>o.supplierId==='regional')!.priceKopeks);
  });
  it('consumes stock with game time, replenishes it, and never double sells a reservation',()=>{
    const sim=new StationSimulation(7,cloneLegacyStation());
    const initial=sim.getOffers('ai92').find(o=>o.supplierId==='regional')!.availableLitres;
    expect(sim.orderTrip('regional',[{fuel:'ai92',litres:100}])).toBe(true);
    expect(sim.getOffers('ai92').find(o=>o.supplierId==='regional')!.availableLitres).toBe(initial-100);
    const cost=sim.deliveries[0].paidKopeks;
    const price=sim.deliveries[0].unitPrices!.ai92;
    sim.step(HOUR);
    expect(sim.getOffers('ai92').find(o=>o.supplierId==='regional')!.availableLitres).toBeLessThan(initial-100);
    sim.market.warehouses.reserve.ai92.litres=0;
    sim.market.warehouses.reserve.ai92.nextRestockSeconds=sim.market.nextWarehouseSeconds;
    sim.step(HOUR);
    expect(sim.market.warehouses.reserve.ai92.litres).toBeGreaterThan(0);
    sim.step(24*HOUR);
    expect(sim.deliveries[0]?.paidKopeks??cost).toBe(cost);
    expect(price).toBeGreaterThan(0);
    sim.market.baseKopeks.ai92+=500;
    expect(sim.deliveries[0].unitPrices!.ai92).toBe(price);
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.market).toEqual(sim.market);
  });
  it('rejects unavailable fuel without charging money and migrates a v0.3.2 save',()=>{
    const sim=new StationSimulation(8,cloneLegacyStation());
    sim.market.warehouses.regional.ai92.litres=0;
    const cash=sim.station.balanceKopeks;
    expect(sim.orderTrip('regional',[{fuel:'ai92',litres:100}])).toBe(false);
    expect(sim.station.balanceKopeks).toBe(cash);
    const old=sim.exportSave();old.version='0.3.2';delete old.state.market;
    const migrated=StationSimulation.importSave(old);
    expect(migrated.station.balanceKopeks).toBe(cash);
    expect(migrated.market.warehouses.regional.ai92.litres).toBeGreaterThan(0);
  });
  it('moves brands independently and keeps weekly growth gradual over a long run',()=>{
    const market=createMarket(0),initial={...market.baseKopeks};
    advanceMarket(market,90*86400);
    expect(market.baseKopeks.ai92).toBeGreaterThan(initial.ai92);
    expect(market.baseKopeks.ai95).toBeGreaterThan(initial.ai95);
    expect(market.baseKopeks.ai92/initial.ai92).not.toBe(market.baseKopeks.ai95/initial.ai95);
    for(const price of Object.values(market.baseKopeks))expect(price).toBeGreaterThan(0);
    expect(market.baseKopeks.ai92).toBeLessThan(initial.ai92*1.2);
  });
  it('has smooth weekday peaks and a different weekend daytime profile',()=>{
    expect(getTrafficMultiplier(8*HOUR)).toBeGreaterThan(getTrafficMultiplier(2*HOUR)*3);
    expect(getTrafficMultiplier(18*HOUR)).toBeGreaterThan(getTrafficMultiplier(13*HOUR));
    expect(getTrafficMultiplier(5*86400+13*HOUR)).toBeGreaterThan(getTrafficMultiplier(5*86400+8*HOUR));
    expect(Math.abs(getTrafficMultiplier(7*HOUR-1)-getTrafficMultiplier(7*HOUR+1))).toBeLessThan(.001);
  });
  it('leaves a newly built pump without channels until a rewire job completes',()=>{
    const sim=new StationSimulation(3,cloneLegacyStation());
    expect(sim.buildPump(2)).toBe(true);sim.step(400);
    expect(sim.station.pumps.find(p=>p.slot===2)?.fuels).toEqual([]);
    expect(sim.setPumpFuels('pump-3',['ai92'])).toBe(true);sim.step(200);
    expect(sim.station.pumps.find(p=>p.slot===2)?.fuels).toEqual(['ai92']);
  });
  it('attracts more customers with a competitive retail price',()=>{
    const run=(delta:number)=>{const sim=new StationSimulation(19,cloneLegacyStation());
      for(const fuel of ['ai92','ai95'] as const)sim.setRetailPrice(fuel,sim.station.fuels[fuel].retailKopeks+delta);
      for(let i=0;i<2880;i++)sim.step(30);
      return sim.stats.visited;};
    expect(run(-400)).toBeGreaterThan(run(400));
  },30000);
});
