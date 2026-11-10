import {describe,expect,it,vi} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {cloneLegacyStation} from '../domain/config';
import {INITIAL_GAME_SECONDS} from './time';
import {GameEngine} from './GameEngine';

describe('v0.2.8 start, reset and traffic',()=>{
it('starts empty at 07:00 and requires construction and delivery before a sale',()=>{
 const sim=new StationSimulation();
 expect(sim.gameSeconds).toBe(INITIAL_GAME_SECONDS);
 expect(sim.station.balanceKopeks).toBe(50_000_000);
 expect(sim.station.pumps).toHaveLength(0);
 expect(sim.station.tanks).toHaveLength(0);
 expect(Object.values(sim.station.fuels).every(f=>f.stockMl===0&&f.capacityMl===0)).toBe(true);
 for(let i=0;i<1000;i++)sim.step(3);
 expect(sim.stats.purchases).toBe(0);
 expect(sim.buildPump(0)).toBe(true);
 expect(sim.station.pumps[0].fuels).toEqual([]);
 expect(sim.buildTank('ai92')).toBe(true);
 sim.step(900);
 expect(sim.setPumpFuels('pump-1',['ai92'])).toBe(true);
 sim.step(180);
 expect(sim.orderDelivery('ai92',100)).toBe(true);
 expect(sim.station.fuels.ai92.stockMl).toBe(0);
});
it('preserves the cash and active work of a 0.2.7 save',()=>{
 const old=new StationSimulation(7,cloneLegacyStation());
 old.buildPump(2);old.orderDelivery('ai92',100);
 const raw={...old.exportSave(),version:'0.2.7'};
 const restored=StationSimulation.importSave(raw);
 expect(restored.station.balanceKopeks).toBe(old.station.balanceKopeks);
 expect(restored.station.pumps).toHaveLength(3);
 expect(restored.station.tanks).toHaveLength(2);
 expect(restored.station.jobs).toEqual(old.station.jobs);
 expect(restored.deliveries).toEqual(old.deliveries);
 expect(restored.exportSave().version).toBe('0.2.8');
});
it('resets the saved party and its controls',()=>{
 const data=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 try {
  const engine=new GameEngine();
  engine.buildPump(0);engine.save();engine.setControls(true,10);engine.reset();
  expect(engine.getState().station.pumps).toHaveLength(0);
  expect(engine.getState().gameSeconds).toBe(INITIAL_GAME_SECONDS);
  expect(new GameEngine().getState().station.pumps).toHaveLength(0);
  engine.pulse(performance.now()+50);
  expect(engine.getState().gameSeconds).toBeGreaterThan(INITIAL_GAME_SECONDS);
 } finally {vi.unstubAllGlobals();}
});
it('keeps serving an old station save at 1× after returning from 10×',()=>{
 const sim=new StationSimulation(12345,cloneLegacyStation());
 let first=0;
 for(let i=0;i<18000;i++){
  sim.step(i>=9000&&i<9300?30:3);
  if(i===9000)first=sim.stats.purchases;
 }
 expect(first).toBeGreaterThan(0);
 expect(sim.stats.purchases).toBeGreaterThan(first);
 expect(sim.vehicles.filter(v=>v.status==='entering').length).toBeLessThan(3);
},30000);
});
