import {describe,it,expect} from 'vitest';
import {StationSimulation} from './StationSimulation';

describe('v0.8.4 finance history',()=>{
 it('keeps recurring expense totals while limiting their entries',()=>{
  const sim=new StationSimulation();
  for(let i=0;i<4000;i++)sim.step(3);
  const lighting=sim.financeEvents.filter(event=>event.kind==='lighting');
  expect(lighting.length).toBeLessThan(10);
  expect(lighting.reduce((sum,event)=>sum+event.amountKopeks,0)).toBe(sim.expenses.lightingKopeks);
  const restored=StationSimulation.importSave(sim.exportSave());
  expect(restored.financeEvents).toEqual(sim.financeEvents);
 });
 it('compacts legacy v0.8.2 expenses without changing their sum',()=>{
  const sim=new StationSimulation();
  const old=sim.exportSave();
  old.version='0.8.2';
  old.state.financeEvents=Array.from({length:2000},(_,i)=>[25200+i*3,1,2]);
  const restored=StationSimulation.importSave(old);
  expect(restored.financeEvents.filter(event=>event.kind==='lighting')).toHaveLength(2);
  expect(restored.financeEvents.reduce((sum,event)=>sum+event.amountKopeks,0)).toBe(4000);
 });
});
