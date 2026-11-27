import {describe,it,expect} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {financeBuckets} from '../../ui/FinanceTrend';
import type {FinanceEvent} from '../domain/types';

describe('bounded finance history',()=>{
  it('rolls up old sales without changing totals or visible weekly buckets after save/load',()=>{
    const sim=new StationSimulation();
    sim.gameSeconds=100*86400;
    const original:FinanceEvent[]=[];
    for(let day=0;day<100;day++)for(let sale=0;sale<100;sale++)original.push({gameSeconds:day*86400+sale*60,kind:'sale',amountKopeks:100+day,costKopeks:50,volumeMl:1000,fuel:'ai92',objectId:'pump-1'});
    sim.financeEvents.push(...original);
    (sim as unknown as {compactFinanceHistory:()=>void}).compactFinanceHistory();
    expect(sim.financeEvents.length).toBeLessThan(3300);
    expect(sim.financeEvents.reduce((sum,e)=>sum+e.amountKopeks,0)).toBe(original.reduce((sum,e)=>sum+e.amountKopeks,0));
    expect(sim.financeEvents.reduce((sum,e)=>sum+(e.costKopeks??0),0)).toBe(500000);
    expect(financeBuckets(sim.financeEvents,sim.gameSeconds,'week')).toEqual(financeBuckets(original,sim.gameSeconds,'week'));
    expect(financeBuckets(sim.financeEvents,sim.gameSeconds,'day')).toEqual(financeBuckets(original,sim.gameSeconds,'day'));
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.financeEvents).toEqual(sim.financeEvents);
  });
});
