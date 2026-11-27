import {describe,it,expect} from 'vitest';
import {financeBuckets} from './FinanceTrend';
import type {FinanceEvent} from '../game/domain/types';

describe('finance trend',()=>{
 it('groups actual transactions once, keeps empty hours, and includes sales cost in profit',()=>{
  const events:FinanceEvent[]=[
   {gameSeconds:3700,kind:'sale',amountKopeks:1000,costKopeks:350},
   {gameSeconds:3800,kind:'goodsSale',amountKopeks:500,costKopeks:100},
   {gameSeconds:7500,kind:'lighting',amountKopeks:200},
  ];
  const buckets=financeBuckets(events,10800,'hour');
  expect(buckets.map(b=>[b.revenue,b.expense,b.profit])).toEqual([[0,0,0],[1500,450,1050],[0,200,-200],[0,0,0]]);
 });
});
