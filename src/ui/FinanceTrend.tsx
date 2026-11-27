import { useState } from 'react';
import type { FinanceEvent } from '../game/domain/types';
import { getClock } from '../game/simulation/time';

type Scale='hour'|'day'|'week';
type Measure='revenue'|'profit'|'expense';
const expenseKinds=new Set(['lighting','pumpElectricity','tankMaintenance','pumping','equipmentRepair','goodsSalary','goodsMaintenance']);
const money=(value:number)=>(value/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const label=(seconds:number,scale:Scale)=>{const clock=getClock(seconds);return scale==='hour'?`День ${clock.day}, ${String(clock.hour).padStart(2,'0')}:00`:scale==='day'?`День ${clock.day}`:`Неделя ${Math.floor((clock.day-1)/7)+1}`;};
export function financeBuckets(events:readonly FinanceEvent[],gameSeconds:number,scale:Scale){
  const span=scale==='hour'?3600:scale==='day'?86400:604800;
  const current=Math.floor(gameSeconds/span);
  const count=scale==='hour'?24:scale==='day'?Math.min(14,current+1):Math.min(12,current+1);
  const first=Math.max(0,current-count+1);
  const buckets=Array.from({length:current-first+1},(_,index)=>({from:(first+index)*span,to:(first+index+1)*span,revenue:0,expense:0,profit:0}));
  for(const event of events){const index=Math.floor(event.gameSeconds/span)-first;if(index<0||index>=buckets.length)continue;
    const bucket=buckets[index];
    if(event.kind==='sale'||event.kind==='goodsSale'){bucket.revenue+=event.amountKopeks;bucket.expense+=event.costKopeks??0;}
    else if(expenseKinds.has(event.kind))bucket.expense+=event.amountKopeks;
  }
  for(const bucket of buckets)bucket.profit=bucket.revenue-bucket.expense;
  return buckets;
}
export function FinanceTrend({events,gameSeconds}:{events:readonly FinanceEvent[];gameSeconds:number}){
  const day=getClock(gameSeconds).day;
  const [choice,setChoice]=useState<Scale|null>(()=>{try{const value=localStorage.getItem('azs-simulator-financeScale');return value==='hour'||value==='day'||value==='week'?value:null;}catch{return null;}});
  const [measure,setMeasure]=useState<Measure>('profit');
  const [selected,setSelected]=useState<number|null>(null);
  const available=(value:Scale)=>value==='hour'||value==='day'&&day>=4||value==='week'&&day>=8;
  const scale=choice&&available(choice)?choice:day>=4?'day':'hour';
  const buckets=financeBuckets(events,gameSeconds,scale);
  const values=buckets.map(bucket=>bucket[measure]);
  const min=Math.min(0,...values),max=Math.max(0,...values);
  const width=700,height=230,left=68,right=18,top=20,bottom=34;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const y=(value:number)=>top+(max-value)/(max-min||1)*plotHeight;
  const x=(index:number)=>left+(buckets.length<2?plotWidth/2:index*plotWidth/(buckets.length-1));
  const points=buckets.map((bucket,index)=>`${x(index)},${y(bucket[measure])}`).join(' ');
  const color=measure==='revenue'?'#7fcaec':measure==='expense'?'#ed963b':'#8de0ad';
  return <div className="finance-trend">
    <div className="periods" role="group" aria-label="Масштаб финансового графика">{([['hour','Часы'],['day','Дни'],['week','Недели']] as const).filter(([id])=>available(id)).map(([id,name])=><button type="button" key={id} className={scale===id?'active':''} onClick={()=>{setChoice(id);setSelected(null);try{localStorage.setItem('azs-simulator-financeScale',id);}catch{/* storage unavailable */}}}>{name}</button>)}</div>
    <div className="periods" role="group" aria-label="Показатель финансового графика">{([['revenue','Выручка'],['profit','Прибыль'],['expense','Расходы']] as const).map(([id,name])=><button type="button" key={id} className={measure===id?'active':''} onClick={()=>{setMeasure(id);setSelected(null);}}>{name}</button>)}</div>
    <svg className="finance-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Финансовая динамика: ${measure==='profit'?'прибыль':measure==='revenue'?'выручка':'расходы'} по игровому времени`}>
      {[min,0,max].map((value,index)=><g key={index}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke={value===0?'#8ca6ad':'#36525d'} strokeDasharray={value===0?undefined:'3 4'}/><text x={left-7} y={y(value)+4} textAnchor="end" fill="#bdcdd0" fontSize="11">{money(value)}</text></g>)}
      {measure==='profit'?values.slice(1).map((value,index)=>{
        const previous=values[index],start=x(index),end=x(index+1),a=y(previous),b=y(value);
        if((previous<0)===(value<0))return <line key={index} x1={start} y1={a} x2={end} y2={b} stroke={previous<0?'#e34c4c':color} strokeWidth="3"/>;
        const crossing=start+(end-start)*previous/(previous-value);
        return <g key={index}><line x1={start} y1={a} x2={crossing} y2={y(0)} stroke={previous<0?'#e34c4c':color} strokeWidth="3"/><line x1={crossing} y1={y(0)} x2={end} y2={b} stroke={value<0?'#e34c4c':color} strokeWidth="3"/></g>;
      }):<polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round"/>}
      {buckets.map((bucket,index)=><circle key={index} cx={x(index)} cy={y(bucket[measure])} r="7" fill={bucket.profit<0&&measure==='profit'?'#e34c4c':color} stroke="#12252b" strokeWidth="2" tabIndex={0} role="button" aria-label={`${label(bucket.from,scale)}: ${money(bucket[measure])}`} onClick={()=>setSelected(index)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(index);}}}/>)}
      <text x={left} y={height-5} fill="#bdcdd0" fontSize="11">{label(buckets[0].from,scale)}</text><text x={width-right} y={height-5} textAnchor="end" fill="#bdcdd0" fontSize="11">{label(buckets.at(-1)!.from,scale)}</text>
    </svg>
    {selected!==null&&buckets[selected]&&<p className="chart-tip">{label(buckets[selected].from,scale)} · {money(buckets[selected][measure])}</p>}
  </div>;
}
