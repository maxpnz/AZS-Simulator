import { useState } from 'react';
import type { FinanceKind, FuelId, GameState } from '../game/domain/types';
import { FUEL_IDS } from '../game/domain/config';
import { getClock } from '../game/simulation/time';

const money=(kopeks:number)=>(kopeks/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const litres=(ml:number)=>(ml/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' л';
const expenseKinds:FinanceKind[]=['lighting','pumpElectricity','tankMaintenance','pumping'];
const labels:Record<FinanceKind,string>={sale:'Продажа топлива',lighting:'Освещение',pumpElectricity:'Электроэнергия ТРК',tankMaintenance:'Обслуживание резервуаров',pumping:'Прокачка топлива',purchase:'Закупка топлива',construction:'Строительство',upgrade:'Модернизация'};
const periods=[['День',86400],['Неделя',604800],['Месяц',2592000],['Всё время',Infinity]] as const;
interface Props {state:GameState;onClose:()=>void;onBack:()=>void}
export function FinancePanel({state,onClose,onBack}:Props){
  const [period,setPeriod]=useState(0);
  const [hover,setHover]=useState<number|null>(null);
  const range=periods[period][1];
  const events=(state.financeEvents??[]).filter(e=>range===Infinity||e.gameSeconds>state.gameSeconds-range);
  const sum=(kind:FinanceKind)=>events.filter(e=>e.kind===kind).reduce((total,e)=>total+e.amountKopeks,0);
  const revenue=sum('sale'),cost=events.reduce((total,e)=>total+(e.kind==='sale'?e.costKopeks??0:0),0);
  const operating=expenseKinds.reduce((total,kind)=>total+sum(kind),0);
  const profit=revenue-cost-operating;
  const purchases=sum('purchase'),construction=sum('construction'),upgrades=sum('upgrade');
  const buckets=Array.from({length:period===0?12:period===1?7:period===2?10:10},(_,index)=>{
    const span=range===Infinity?Math.max(1,state.gameSeconds-(events[0]?.gameSeconds??state.gameSeconds)):range;
    const from=state.gameSeconds-span+span*index/(period===0?12:period===1?7:10);
    const to=state.gameSeconds-span+span*(index+1)/(period===0?12:period===1?7:10);
    const entries=events.filter(e=>e.gameSeconds>=from&&(index===(period===0?11:period===1?6:9)?e.gameSeconds<=to:e.gameSeconds<to));
    const r=entries.filter(e=>e.kind==='sale').reduce((v,e)=>v+e.amountKopeks,0);
    const c=entries.reduce((v,e)=>v+(e.kind==='sale'?(e.costKopeks??0):expenseKinds.includes(e.kind)?e.amountKopeks:0),0);
    return {from,to,revenue:r,cost:c,profit:r-c};
  });
  const max=Math.max(1,...buckets.flatMap(b=>[Math.abs(b.revenue),Math.abs(b.cost),Math.abs(b.profit)]));
  const clock=(seconds:number)=>{const c=getClock(seconds);return `День ${c.day}, ${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;};
  return <section className="full-screen finance-screen" role="dialog" aria-label="Финансы АЗС">
    <header className="screen-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>Финансы АЗС</h2><small>Прибыль, запасы и движение денег</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре">×</button></header>
    <div className="screen-content">
      <div className="periods" role="group" aria-label="Период отчёта">{periods.map(([name],index)=><button key={name} type="button" className={period===index?'active':''} onClick={()=>{setPeriod(index);setHover(null);}}>{name}</button>)}</div>
      <div className="finance-cards">
        {[['Выручка',revenue],['Себестоимость продаж',cost],['Операционные расходы',operating],['Операционная прибыль',profit]].map(([name,value])=><div className="finance-card" key={name}><span>{name}</span><strong className={Number(value)<0?'negative':''}>{money(Number(value))}</strong></div>)}
      </div>
      <div className="finance-summary"><span>Валовая прибыль: <b>{money(revenue-cost)}</b></span><span>Рентабельность: <b>{revenue?((profit/revenue)*100).toFixed(1):'0,0'}%</b></span><span>Денежный баланс: <b>{money(state.station.balanceKopeks)}</b></span></div>
      <h3>Динамика</h3><div className="chart-legend"><span>■ Выручка</span><span>■ Себестоимость и расходы</span><span>■ Операционная прибыль</span></div>
      <div className="finance-chart" role="img" aria-label="График финансов по игровому времени">{buckets.map((bucket,index)=><button type="button" key={index} className="chart-bucket" onFocus={()=>setHover(index)} onMouseEnter={()=>setHover(index)} onClick={()=>setHover(index)} aria-label={`${clock(bucket.from)}: выручка ${money(bucket.revenue)}, затраты ${money(bucket.cost)}, прибыль ${money(bucket.profit)}`}>
        <i className="bar revenue" style={{height:`${Math.max(2,Math.abs(bucket.revenue)/max*44)}%`}}/><i className="bar costs" style={{height:`${Math.max(2,Math.abs(bucket.cost)/max*44)}%`}}/><i className={`bar profit ${bucket.profit<0?'negative':''}`} style={{height:`${Math.max(2,Math.abs(bucket.profit)/max*44)}%`}}/></button>)}</div>
      {hover!==null&&<p className="chart-tip">{clock(buckets[hover].from)} — {clock(buckets[hover].to)} · выручка {money(buckets[hover].revenue)} · затраты {money(buckets[hover].cost)} · прибыль {money(buckets[hover].profit)}</p>}
      <h3>Выручка по видам топлива</h3><div className="finance-table-wrap"><table><thead><tr><th>Топливо</th><th>Литры</th><th>Выручка</th><th>Средняя цена</th><th>Себестоимость</th><th>Валовая прибыль</th><th>Маржа</th></tr></thead><tbody>{FUEL_IDS.map(fuel=>{
        const rows=events.filter(e=>e.kind==='sale'&&e.fuel===fuel);const ml=rows.reduce((v,e)=>v+(e.volumeMl??0),0);const r=rows.reduce((v,e)=>v+e.amountKopeks,0);const c=rows.reduce((v,e)=>v+(e.costKopeks??0),0);
        return <tr key={fuel}><th>{state.station.fuels[fuel as FuelId].name}</th><td>{litres(ml)}</td><td>{money(r)}</td><td>{ml?money(Math.round(r*1000/ml)):'—'}</td><td>{money(c)}</td><td>{money(r-c)}</td><td>{r?((r-c)/r*100).toFixed(1):'0,0'}%</td></tr>;
      })}</tbody></table></div>
      <div className="finance-columns"><div><h3>Операционные расходы</h3>{expenseKinds.map(kind=><div className="finance-line" key={kind}><span>{labels[kind]}</span><b>{money(sum(kind))}</b></div>)}</div><div><h3>Движение денег</h3><div className="finance-line"><span>Поступления от продаж</span><b>{money(revenue)}</b></div><div className="finance-line"><span>Оплаченные закупки</span><b>{money(-purchases)}</b></div><div className="finance-line"><span>Операционные платежи</span><b>{money(-operating)}</b></div><div className="finance-line"><span>Строительство</span><b>{money(-construction)}</b></div><div className="finance-line"><span>Модернизация</span><b>{money(-upgrades)}</b></div><div className="finance-line total"><span>Чистое изменение</span><b>{money(revenue-purchases-operating-construction-upgrades)}</b></div></div></div>
      <p>Стоимость запасов: {money(Object.values(state.expenses?.stockValueKopeks??{}).reduce((a,b)=>a+b,0))}. Оплаченные закупки и строительство отражены в денежном потоке; себестоимость признаётся при продаже.</p>
      <h3>История операций</h3>{events.length?<div className="event-list">{[...events].reverse().slice(0,150).map((event,index)=><div className="finance-line" key={index}><span>{clock(event.gameSeconds)} · {labels[event.kind]}{event.fuel?` · ${state.station.fuels[event.fuel].name}`:''}{event.volumeMl?` · ${litres(event.volumeMl)}`:''}</span><b>{event.kind==='sale'?'+':'−'}{money(event.amountKopeks)}</b></div>)}</div>:<p>За выбранный период операций нет. Для сохранений v0.3.1 новая история начинается с момента обновления; прошлые операции не восстанавливаются.</p>}
    </div>
  </section>;
}
