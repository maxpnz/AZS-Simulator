import {describe,expect,it} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {cloneLegacyStation} from '../domain/config';
import {serviceRating} from '../domain/serviceRating';
import {PARKING_X,ROAD_NODES} from '../domain/roadNetwork';

describe('v0.7.4 release acceptance',()=>{
  it('calculates an honest service rating from actual outcomes',()=>{
    expect(serviceRating({purchases:0,unserved:0,leftQueue:0})).toBeNull();
    expect(serviceRating({purchases:8,unserved:1,leftQueue:1})).toBe(4);
    expect(serviceRating({purchases:0,unserved:2,leftQueue:0})).toBe(0);
  });
  it('cancels goods once, refunds once and never delivers cancelled stock after reload',()=>{
    const sim=new StationSimulation(44,cloneLegacyStation());
    expect(sim.openVenue('shop')).toBe(true);
    const before=sim.station.balanceKopeks;
    expect(sim.orderGoods('standard',{water:10})).toBe(true);
    const id=sim.commerce.orders[0].id;
    expect(sim.cancelGoodsOrder(id)).toBe(true);
    expect(sim.cancelGoodsOrder(id)).toBe(false);
    expect(sim.station.balanceKopeks).toBe(before);
    const restored=StationSimulation.importSave(sim.exportSave());
    restored.step(7200);
    expect(restored.commerce.stock.water.quantity).toBe(0);
    expect(restored.commerce.orders[0].status).toBe('cancelled');
    expect(restored.financeEvents.filter(e=>e.kind==='goodsRefund')).toHaveLength(1);
  });
  it('cancels a fuel trip once, refunds the paid amount and frees capacity',()=>{
    const sim=new StationSimulation(45,cloneLegacyStation());
    const before=sim.station.balanceKopeks;
    expect(sim.orderDelivery('ai92',500)).toBe(true);
    const id=sim.deliveries[0].id;
    expect(sim.cancelDelivery(id)).toBe(true);
    expect(sim.cancelDelivery(id)).toBe(false);
    expect(sim.station.balanceKopeks).toBe(before);
    expect(sim.deliveries).toHaveLength(0);
    expect(sim.expenses.purchasesKopeks).toBe(0);
    expect(sim.financeEvents.filter(e=>e.kind==='purchaseRefund')).toHaveLength(1);
  });
  it('preserves a v0.7.3 parking reservation and finance events',()=>{
    const sim=new StationSimulation(46,cloneLegacyStation());
    sim.openVenue('shop');sim.orderGoods('standard',{water:10});
    for(let i=0;i<700&&sim.commerce.parking.every(id=>id===null);i++)sim.step(60);
    const before=sim.exportSave();before.version='0.7.3';
    const restored=StationSimulation.importSave(before);
    expect(restored.commerce.parking).toEqual(sim.commerce.parking);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.financeEvents).toEqual(sim.financeEvents);
    expect(restored.exportSave().version).toBe('0.7.4');
  },30000);
  it('keeps reservations unique and vehicles on valid routes during a busy day and after reload',()=>{
    let sim=new StationSimulation(47,cloneLegacyStation());
    sim.openVenue('shop');sim.openVenue('cafe');
    sim.orderGoods('standard',{water:100,hotdog:100,chocolate:100,snacks:100,coffee:10000,milk:10000,cake:100,pie:100});
    const nodes=new Set(ROAD_NODES.map(n=>n.id));
    for(let i=0;i<1800;i++){
      sim.step(60);
      if(i===720)sim=StationSimulation.importSave(sim.exportSave());
      if(i%100===0){
        const slots=sim.commerce.parking.filter((id):id is number=>id!==null);
        expect(slots.length).toBeLessThanOrEqual(PARKING_X.length);
        expect(new Set(slots).size).toBe(slots.length);
        for(const id of slots)expect(sim.vehicles.some(vehicle=>vehicle.id===id)).toBe(true);
        for(const vehicle of sim.vehicles)for(const node of vehicle.route)expect(nodes.has(node)).toBe(true);
        expect(sim.trafficDiagnostics(1800)).toEqual([]);
      }
    }
  },30000);
});
