import {describe,it,expect,vi} from 'vitest';
import {GameEngine,decodeStoredSave,encodeStoredSave} from './GameEngine';
import {StationSimulation} from './StationSimulation';
import {cloneLegacyStation} from '../domain/config';
import {condition,wearPump,wearTank,PUMP_LIFETIME_ML,TANK_LIFETIME_ML} from '../domain/technical';
import {createVehicle,RandomSource} from './traffic';

describe('v0.8.1 regression',()=>{
 it('retries autosave after a failed write without replacing the last valid record',()=>{
  const data=new Map<string,string>();let fail=false;
  vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{if(fail&&k==='azs-simulator-save')throw Error('quota');data.set(k,v)},removeItem:(k:string)=>data.delete(k)});
  try{const game=new GameEngine();game.save();const valid=data.get('azs-simulator-save');expect(valid).toBeTruthy();fail=true;game.openVenue('shop');expect(data.get('azs-simulator-save')).toBe(valid);fail=false;game.save();expect(data.get('azs-simulator-save')).not.toBe(valid);expect(new GameEngine().getState().commerce?.venues.shop.level).toBe(1);for(const slot of [1,2,3])expect(game.saveSlot(slot)).toBe(true);}finally{vi.unstubAllGlobals()}
 });
 it('compresses large saves losslessly and detects damaged compressed data',()=>{
  const raw=JSON.stringify({version:'0.8.1',history:Array.from({length:10000},(_,i)=>[i,'sale',i*57,'ai92'])});
  const packed=encodeStoredSave(raw);
  expect(packed.length).toBeLessThan(raw.length/2);
  expect(decodeStoredSave(packed)).toBe(raw);
  expect(()=>decodeStoredSave('AZS-LZ1:broken')).toThrow();
 });
 it('defers pump disable and upgrade, charges upgrade once, and persists the request',()=>{
  const sim=new StationSimulation(7,cloneLegacyStation());const vehicle=createVehicle(101,sim.gameSeconds,new RandomSource(7));
  Object.assign(vehicle,{pumpId:'pump-1',status:'toPump',fuel:'ai92'});sim.vehicles.push(vehicle);
  expect(sim.setPumpEnabled('pump-1',false)).toBe(true);expect(sim.station.pumps[0].enabled).toBe(true);
  let restored=StationSimulation.importSave(sim.exportSave());expect(restored.station.pumps[0].pendingAction).toBe('disable');restored.vehicles.length=0;restored.step(1);expect(restored.station.pumps[0].enabled).toBe(false);
  sim.station.pumps[0].pendingAction=undefined;const balance=sim.station.balanceKopeks;
  expect(sim.upgradePump('pump-1')).toBe(true);expect(sim.upgradePump('pump-1')).toBe(false);expect(sim.station.balanceKopeks).toBe(balance);
  restored=StationSimulation.importSave(sim.exportSave());restored.vehicles.length=0;restored.step(1);expect(restored.station.balanceKopeks).toBe(balance-1_200_000);expect(restored.financeEvents.filter(e=>e.kind==='upgrade'&&e.objectId==='pump-1')).toHaveLength(1);
 });
 it.each([0,1,49,49.99,50,51])('applies the 50 litre sale boundary: %s',litres=>{
  const sim=new StationSimulation(8,cloneLegacyStation());const tank=sim.station.tanks[0];tank.stockMl=Math.round(litres*1000);sim.station.fuels[tank.fuel].stockMl=tank.stockMl;
  const balance=sim.station.balanceKopeks;const ok=sim.sellTank(tank.id);expect(ok).toBe(litres<50);expect(sim.sellTank(tank.id)).toBe(false);
  if(ok){expect(sim.station.balanceKopeks).toBeGreaterThan(balance);expect(sim.financeEvents.filter(e=>e.kind==='resale'&&e.objectId===tank.id)).toHaveLength(1);expect(sim.station.tanks.some(t=>t.id===tank.id)).toBe(false)}
 });
 it('uses actual throughput; a shared tank survives longer than four pumps',()=>{
  const sim=new StationSimulation(9,cloneLegacyStation());const pump=sim.station.pumps[0],tank=sim.station.tanks[0];
  wearPump(pump,PUMP_LIFETIME_ML/5);expect(condition(pump)).toBeCloseTo(80);expect(condition(tank)).toBe(100);
  for(const count of [1,2,4]){tank.condition=100;for(let i=0;i<count;i++){wearTank(tank,10_000_000);wearTank(tank,10_000_000)}expect(condition(tank)).toBeCloseTo(100-count*10_000_000/TANK_LIFETIME_ML*100)}
 });
 it('migrates v0.8.0 wear without changing money, stock, or pending deliveries',()=>{
  const sim=new StationSimulation(11,cloneLegacyStation());sim.station.pumps[0].condition=42;
  sim.station.pumps[0].pumpedMlSinceRepair=87_000_000;
  const old=sim.exportSave();old.version='0.8.0';
  const restored=StationSimulation.importSave(old);
  expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
  expect(restored.station.tanks).toEqual(sim.station.tanks);
  expect(restored.station.pumps[0].condition).toBe(42);
  expect(restored.station.pumps[0].pumpedMlSinceRepair).toBe(Math.round(.58*PUMP_LIFETIME_ML));
 });
});
