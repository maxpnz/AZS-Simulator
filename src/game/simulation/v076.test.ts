import {describe,expect,it} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {cloneLegacyStation} from '../domain/config';
import {CONTRACTORS,estimateRepair} from '../domain/technical';
import {PARKING_SLOTS} from '../domain/roadNetwork';
import {createVehicle,RandomSource} from './traffic';

describe('v0.7.6 acceptance',()=>{
 it('offers ordered repair quotes, refuses insufficient cash and resumes one paid repair',()=>{
  const sim=new StationSimulation(11,cloneLegacyStation());sim.station.pumps[0].condition=40;
  const quotes=(Object.keys(CONTRACTORS) as (keyof typeof CONTRACTORS)[]).map(key=>({price:estimateRepair('pump',40,CONTRACTORS[key].speed).partsKopeks+CONTRACTORS[key].call*100,time:estimateRepair('pump',40,CONTRACTORS[key].speed).durationSeconds+CONTRACTORS[key].arrival}));
  expect(quotes[0].price).toBeLessThan(quotes[1].price);expect(quotes[1].price).toBeLessThan(quotes[2].price);
  expect(quotes[0].time).toBeGreaterThan(quotes[1].time);expect(quotes[1].time).toBeGreaterThan(quotes[2].time);
  sim.station.balanceKopeks=quotes[1].price-1;expect(sim.callContractor('pump-1','standard')).toBe(false);expect(sim.technical.tasks).toHaveLength(0);
  sim.station.balanceKopeks=quotes[1].price+100000;expect(sim.callContractor('pump-1','standard')).toBe(true);expect(sim.callContractor('pump-1','urgent')).toBe(false);
  const saved=StationSimulation.importSave(sim.exportSave());expect(saved.technical.tasks[0].paid).toBe(true);expect(saved.technical.tasks[0].paymentEventId).toBe(saved.financeEvents.find(e=>e.kind==='equipmentRepair')?.id);
  const paidBalance=saved.station.balanceKopeks;const paidCount=saved.financeEvents.filter(e=>e.kind==='equipmentRepair').length;
  saved.step(60);expect(saved.station.balanceKopeks).toBeLessThanOrEqual(paidBalance);expect(saved.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(paidCount);
 });
 it('preserves work progress and ledger through a second reload',()=>{
  const original=new StationSimulation(31,cloneLegacyStation());original.station.pumps[0].condition=0;
  expect(original.callContractor('pump-1','urgent')).toBe(true);
  const first=StationSimulation.importSave(original.exportSave());first.step(CONTRACTORS.urgent.arrival+30);
  expect(first.technical.tasks[0].phase).toBe('working');const remaining=first.technical.tasks[0].phaseRemaining;
  const second=StationSimulation.importSave(first.exportSave());expect(second.technical.tasks[0].phaseRemaining).toBe(remaining);
  const balance=second.station.balanceKopeks;second.step(remaining+10);
  expect(second.station.pumps[0].condition).toBe(100);expect(second.technical.tasks).toHaveLength(0);
  expect(second.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(1);
  expect(second.station.balanceKopeks).toBeLessThanOrEqual(balance);
 });
 it('loads staff fields without salary or automatic work and keeps paid contractors',()=>{
  const sim=new StationSimulation(12,cloneLegacyStation());sim.station.pumps[0].condition=0;sim.callContractor('pump-1','budget');
  const old=sim.exportSave();old.version='0.7.4';old.state.technical!.mode='automatic';old.state.technical!.technicians.push({id:'tech-1',name:'Иван',level:1,phase:'inside',x:1100,y:420,phaseRemaining:0,trainingRemaining:0,salaryRemainder:0,salarySeconds:0});
  old.state.technical!.tasks.push({id:'repair-old',equipmentId:'pump-2',kind:'pump',technicianId:'tech-1',source:'manual',phase:'working',phaseRemaining:120,paid:true,partsKopeks:1000,callKopeks:0,conditionBefore:50,durationSeconds:240,executorName:'Иван',paymentEventId:'payment-repair-old'});
  const restored=StationSimulation.importSave(old);expect(restored.technical.technicians).toHaveLength(0);expect(restored.technical.mode).toBe('manual');expect(restored.technical.tasks).toHaveLength(2);expect(restored.technical.tasks.find(t=>t.id==='repair-old')?.contractor).toBe('standard');
  const salary=restored.financeEvents.filter(e=>e.kind==='technicianSalary').length;restored.step(3600);expect(restored.financeEvents.filter(e=>e.kind==='technicianSalary')).toHaveLength(salary);
 });
 it.each([3,6,12])('keeps traffic moving with %i-second ticks, pause and save reload',tick=>{
  const sim=new StationSimulation(51,cloneLegacyStation());sim.openVenue('shop');sim.orderGoods('standard',{water:100,hotdog:100});
  let observedParking=false;
  for(let elapsed=0;elapsed<7200;elapsed+=tick){sim.step(tick);if(sim.commerce.parking.some(id=>id!==null))observedParking=true;}
  expect(observedParking).toBe(true);
  const paused=sim.gameSeconds;expect(sim.gameSeconds).toBe(paused);
  const restored=StationSimulation.importSave(sim.exportSave());
  for(let elapsed=0;elapsed<3600;elapsed+=tick)restored.step(tick);
  expect(restored.trafficDiagnostics(1800)).toEqual([]);
  expect(new Set(restored.commerce.parking.filter(id=>id!==null)).size).toBe(restored.commerce.parking.filter(id=>id!==null).length);
  expect(restored.stats.passed+restored.stats.departed).toBeGreaterThan(0);
 },30000);
 it('keeps long vans out of the ten passenger bays after refuelling',()=>{
  const sim=new StationSimulation(52,cloneLegacyStation());sim.openVenue('shop');
  const vehicle=createVehicle(999,sim.gameSeconds,new RandomSource(52));
  Object.assign(vehicle,{modelId:'delivery-van',category:'van',status:'finishing',setupRemainingSeconds:0,wantsShop:true,wantsCafe:false,pumpId:'pump-1',route:['pump_1'],routeIndex:1});
  sim.vehicles.push(vehicle);sim.step(3);
  expect(vehicle.status).toBe('leaving');expect(vehicle.parkSlot).toBeUndefined();expect(sim.commerce.parking.every(id=>id===null)).toBe(true);
 });
 it('has ten distinct marked bays and maintains unique live reservations under traffic',()=>{
  expect(PARKING_SLOTS).toHaveLength(10);expect(new Set(PARKING_SLOTS.map(({x,y})=>`${x},${y}`)).size).toBe(10);
  const sim=new StationSimulation(12345,cloneLegacyStation());sim.openVenue('shop');sim.openVenue('cafe');
  let maxParked=0;const seenRows=new Set<number>();for(let i=0;i<800;i++){sim.step(60);const actual=sim.vehicles.filter(v=>v.status==='parked');maxParked=Math.max(maxParked,actual.length);for(const vehicle of actual){seenRows.add(vehicle.parkSlot!<5?0:1);expect(vehicle.parkSlot).toBeDefined();expect(Math.abs(vehicle.x-PARKING_SLOTS[vehicle.parkSlot!].x)).toBeLessThan(4);expect(Math.abs(vehicle.y-PARKING_SLOTS[vehicle.parkSlot!].y)).toBeLessThan(4);expect(Math.abs(Math.sin(vehicle.angle))).toBeCloseTo(1,2);}}
  expect(maxParked).toBeGreaterThan(0);expect(seenRows.size).toBe(2);
  const parked=sim.commerce.parking.filter((id):id is number=>id!==null);expect(new Set(parked).size).toBe(parked.length);
  for(const id of parked){const vehicle=sim.vehicles.find(v=>v.id===id);expect(vehicle).toBeDefined();expect(vehicle?.category).not.toBe('truck');}
  expect(sim.trafficDiagnostics(1800)).toEqual([]);
 },30000);
});
