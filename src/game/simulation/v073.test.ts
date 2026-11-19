import { GOODS_DRIVE_SECONDS, goodsUnloadSeconds } from '../domain/goodsDelivery';
import {describe,expect,it} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {nearestFuelDeliverySeconds} from '../domain/deliveryMotion';
import {PARKING_X,ROAD_NODES,roadContainsPoint} from '../domain/roadNetwork';
import {hitTest} from '../../ui/scene/createStationScene';
import {cloneLegacyStation} from '../domain/config';

describe('v0.7.3 regression checks',()=>{
  it('keeps the shop and cafe facade hit areas disjoint and the exit bays on asphalt',()=>{
    expect(hitTest(600,250)).toBe('shop');
    expect(hitTest(1000,250)).toBe('cafe');
    expect(PARKING_X).toHaveLength(5);
    for(const x of PARKING_X)expect(roadContainsPoint(x,740)).toBe(true);
    expect(ROAD_NODES.find(n=>n.id==='entrance')!.x).toBeLessThan(1833);
  });
  it('uses the earliest tanker arrival regardless of order and ignores unloading time',()=>{
    const first={status:'enroute',arrivalGameSeconds:5000};
    const second={status:'enroute',arrivalGameSeconds:3000};
    const unloading={status:'unloading',arrivalGameSeconds:100};
    expect(nearestFuelDeliverySeconds([first,second,unloading] as never[],1000)).toBe(2000);
    expect(nearestFuelDeliverySeconds([unloading] as never[],1000)).toBeNull();
  });
  it('charges a mixed shop and cafe order once, delivers once, records product sales and resumes from save',()=>{
    const sim=new StationSimulation(12345,cloneLegacyStation());
    expect(sim.openVenue('shop')).toBe(true);
    expect(sim.openVenue('cafe')).toBe(true);
    const before=sim.station.balanceKopeks;
    expect(sim.orderGoods('standard',{water:100,hotdog:100,chocolate:100,snacks:100,coffee:10000,milk:10000,cake:100,pie:100})).toBe(true);
    const paid=sim.commerce.orders[0].totalKopeks;
    expect(sim.station.balanceKopeks).toBe(before-paid);
    expect(sim.orderGoods('standard',{water:1000})).toBe(false);
    const cash=sim.station.balanceKopeks;sim.station.balanceKopeks=0;
    expect(sim.orderGoods('standard',{water:1})).toBe(false);
    sim.station.balanceKopeks=cash;
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    restored.step(7200 + 2 * GOODS_DRIVE_SECONDS + goodsUnloadSeconds(restored.commerce.orders[0]));
    expect(restored.commerce.orders[0].status).toBe('delivered');
    expect(restored.commerce.stock.water.quantity).toBe(100);
    restored.step(9600);
    expect(restored.commerce.stock.water.quantity).toBeLessThanOrEqual(100);
    expect(restored.financeEvents.filter(e=>e.kind==='goodsPurchase')).toHaveLength(1);
    for(let i=0;i<1440;i++)restored.step(60);
    const sales=restored.financeEvents.filter(e=>e.kind==='goodsSale');
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every(e=>!!e.productId)).toBe(true);
    expect(StationSimulation.importSave(restored.exportSave()).financeEvents.filter(e=>e.kind==='goodsSale').map(e=>e.productId)).toEqual(sales.map(e=>e.productId));
    expect(restored.trafficDiagnostics(1800)).toEqual([]);
  },30000);
  it('moves a legacy ten-bay reservation to the exit apron without changing cash or stock',()=>{
    const sim=new StationSimulation(19,cloneLegacyStation());sim.openVenue('shop');
    const old=sim.exportSave();old.version='0.7.0';
    const vehicle={id:987,modelId:'budget-sedan',category:'sedan',status:'parked',x:970,y:460,angle:0,route:['parking_4'],routeIndex:1,parkSlot:4};
    old.state.vehicles.push(vehicle as never);
    old.state.commerce!.parking=Array(10).fill(null);old.state.commerce!.parking[4]=987;
    const restored=StationSimulation.importSave(old);
    expect(restored.commerce.parking).toHaveLength(10);
    expect(restored.commerce.parking[4]).toBe(987);
    expect(restored.vehicles.find(v=>v.id===987)?.x).toBe(PARKING_X[4]);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.commerce.stock).toEqual(sim.commerce.stock);
  });
  it('preserves a car parked in the new layout across a save reload',()=>{
    const sim=new StationSimulation(17,cloneLegacyStation());sim.openVenue('shop');sim.orderGoods('standard',{water:50});
    for(let i=0;i<1000&&sim.commerce.parking.every(id=>id===null);i++)sim.step(60);
    const occupied=sim.commerce.parking.findIndex(id=>id!==null);
    expect(occupied).toBeGreaterThanOrEqual(0);
    const id=sim.commerce.parking[occupied]!;
    const vehicle=sim.vehicles.find(v=>v.id===id)!;
    const before={x:vehicle.x,y:vehicle.y,route:[...vehicle.route],routeIndex:vehicle.routeIndex};
    const restored=StationSimulation.importSave(sim.exportSave());
    const after=restored.vehicles.find(v=>v.id===id)!;
    expect(restored.commerce.parking[occupied]).toBe(id);
    expect({x:after.x,y:after.y,route:after.route,routeIndex:after.routeIndex}).toEqual(before);
  },30000);
});
