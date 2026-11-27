import {describe,it,expect} from 'vitest';
import {cloneLegacyStation} from '../domain/config';
import {StationSimulation} from './StationSimulation';
import {pumpQueuePoint} from '../domain/roadNetwork';
import {createVehicle,RandomSource} from './traffic';

describe('v0.8.2 pump dispatch',()=>{
 it('holds a queue bay until a car on the crossing exit lane passes',()=>{
  const sim=new StationSimulation(1,cloneLegacyStation());
  const bay=pumpQueuePoint(0);
  const head=createVehicle(100,sim.gameSeconds,new RandomSource(100));
  Object.assign(head,{status:'queued',pumpId:'pump-1',fuel:'ai92',x:bay.x,y:bay.y,route:['pump_1_queue'],routeIndex:1,tankCapacityMl:50000,currentFuelMl:10000,budgetKopeks:1000000});
  const departing=createVehicle(101,sim.gameSeconds,new RandomSource(101));
  Object.assign(departing,{status:'leaving',pumpId:'pump-6',x:bay.x+60,y:650,route:['exit_lane','exit'],routeIndex:0});
  sim.vehicles.push(head,departing);sim.queueIds.push(head.id);
  const dispatch=()=> (sim as unknown as {dispatchQueue:()=>void}).dispatchQueue();
  dispatch();
  expect(head.status).toBe('queued');
  expect(sim.queueIds).toContain(head.id);
  departing.x=bay.x+300;
  dispatch();
  expect(head.status).toBe('toPump');
  expect(sim.queueIds).not.toContain(head.id);
 });
 it.each([1,2,4,5,10])('keeps reservations unique during traffic at %s×',speed=>{
  const sim=new StationSimulation(0x41a25,cloneLegacyStation());
  for(let i=0;i<1200;i++){
   sim.step(3*speed);
   if(i%100===0){
    const active=sim.vehicles.filter(v=>v.pumpId&&['toPump','fueling','finishing'].includes(v.status));
    expect(new Set(active.map(v=>v.pumpId)).size).toBe(active.length);
    expect(sim.trafficDiagnostics(1800)).toEqual([]);
   }
  }
 });
});
