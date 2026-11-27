import {describe,it,expect} from 'vitest';
import {PARKING_SLOTS} from '../domain/roadNetwork';
import {cloneLegacyStation} from '../domain/config';
import {StationSimulation} from './StationSimulation';
import type {Vehicle} from '../domain/types';

describe('single row parking migration',()=>{
 it('places ten bays along one fence and keeps a separate truck bay',()=>{
  expect(PARKING_SLOTS).toHaveLength(10);
  expect(new Set(PARKING_SLOTS.map(slot=>slot.y))).toEqual(new Set([852]));
  expect(PARKING_SLOTS.every((slot,index)=>index===0||slot.x>PARKING_SLOTS[index-1].x)).toBe(true);
 });
 it('moves an occupied old 0.8.1 bay once while preserving money and orders',()=>{
  const sim=new StationSimulation(8,cloneLegacyStation());sim.openVenue('shop');sim.orderGoods('standard',{water:10});
  const old=sim.exportSave();old.version='0.8.1';delete (old as {parkingLayout?:string}).parkingLayout;
  const vehicle={id:777,modelId:'budget-sedan',category:'sedan',status:'parked',parkSlot:7,x:525,y:852,angle:Math.PI/2,route:['parking_7'],routeIndex:1} as Vehicle;
  old.state.vehicles.push(vehicle);old.state.commerce!.parking[7]=777;
  const restored=StationSimulation.importSave(old);
  expect(restored.vehicles.find(v=>v.id===777)).toMatchObject({x:PARKING_SLOTS[7].x,y:PARKING_SLOTS[7].y,parkSlot:7});
  expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
  expect(restored.commerce.orders).toEqual(sim.commerce.orders);
  const again=StationSimulation.importSave(restored.exportSave());
  expect(again.vehicles.find(v=>v.id===777)?.x).toBe(PARKING_SLOTS[7].x);
 });
});
