import {describe,it,expect} from 'vitest';
import {cloneLegacyStation} from '../domain/config';
import {StationSimulation} from './StationSimulation';

describe('v0.8.2 pump dispatch',()=>{
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
