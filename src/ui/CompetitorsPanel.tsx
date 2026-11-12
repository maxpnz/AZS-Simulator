import { useState } from 'react';
import { COMPETITORS, marketPosition, priceHistory, type CompetitorState, type HistoryPeriod } from '../game/domain/competitors';
import { FUEL_IDS } from '../game/domain/config';
import type { FuelId, GameState } from '../game/domain/types';
import { version } from '../../package.json';
const periods:readonly [HistoryPeriod,string][]=[['day','День'],['week','Неделя'],['month','Месяц'],['all','Всё время']];
const chartColors:Record<FuelId,string>={ai92:'#80d76c',ai95:'#62b2f5',ai95plus:'#b9a1f8',ai98:'#ffba69',ai100:'#f28e8e',diesel:'#f4dc80'};
function PriceChart({station,period,now,names}:{station:CompetitorState;period:HistoryPeriod;now:number;names:Record<FuelId,string>}){
  const points=priceHistory(station,period,now),fuels=FUEL_IDS.filter(f=>station.prices[f]!==undefined);
  const values=points.flatMap(p=>fuels.flatMap(f=>p.prices[f]===undefined?[]:[p.prices[f]!]));
  if(!values.length)return <p>История цен пока пуста.</p>;
  const min=Math.floor((Math.min(...values)-100)/100)*100,max=Math.ceil((Math.max(...values)+100)/100)*100;
  const from=points[0].seconds,to=points[points.length-1].seconds;
  const x=(seconds:number)=>48+(to===from?350:(seconds-from)/(to-from)*700);
  const y=(price:number)=>190-(price-min)/(max-min)*150;
  return <div className="competitor-chart"><svg viewBox="0 0 800 220" role="img" aria-label="График истории цен конкурента">
    {[0,1,2,3].map(i=><g key={i}><line x1="48" x2="748" y1={40+i*50} y2={40+i*50} stroke="#38515d"/><text x="5" y={44+i*50} fill="#a6c0c5" fontSize="12">{((max-(max-min)*i/3)/100).toFixed(0)}</text></g>)}
    {fuels.map(f=>{const series=points.flatMap(p=>p.prices[f]===undefined?[]:[{seconds:p.seconds,price:p.prices[f]!}]);return <g key={f}><polyline points={series.map(p=>`${x(p.seconds)},${y(p.price)}`).join(' ')} fill="none" stroke={chartColors[f]} strokeWidth="3" strokeLinejoin="round"/>{series.map(p=><circle key={p.seconds} cx={x(p.seconds)} cy={y(p.price)} r="3" fill={chartColors[f]}/>)}</g>;})}
  </svg><div className="competitor-legend">{fuels.map(f=><span key={f} style={{color:chartColors[f]}}>● {names[f]}</span>)}</div></div>;
}
export function CompetitorsPanel({state,onClose,onBack}:{state:GameState;onClose:()=>void;onBack:()=>void}){
  const [selected,setSelected]=useState<string|null>(null);const [period,setPeriod]=useState<HistoryPeriod>('week');
  const competition=state.competition;if(!competition)return null;
  const station=competition.stations.find(s=>s.id===selected),profile=COMPETITORS.find(s=>s.id===selected);
  const price=(kopeks:number)=>(kopeks/100).toFixed(2)+' ₽';
  return <section className="full-screen" role="dialog" aria-label="Конкуренты">
    <header className="screen-header"><button type="button" onClick={selected?()=>setSelected(null):onBack}>← {selected?'Конкуренты':'Меню'}</button><div><h2>{profile?.name??'Конкуренты'}</h2><small>АЗС Simulator · v{version}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре">×</button></header>
    <div className="screen-content competitors-panel">{!station?<>
      <p>Цены обновляются по игровому времени. Во время просмотра симуляция приостановлена. На узком экране таблицу можно прокручивать в сторону.</p>
      <div className="competitor-table"><table><thead><tr><th>АЗС</th>{FUEL_IDS.map(f=><th key={f}>{state.station.fuels[f].name}</th>)}</tr></thead><tbody>
        <tr><th>Наша АЗС</th>{FUEL_IDS.map(f=><td key={f}>{price(state.station.fuels[f].retailKopeks)}<small>{marketPosition(competition,f,state.station.fuels[f].retailKopeks)}</small></td>)}</tr>
        {competition.stations.map((s,index)=><tr key={s.id} onClick={()=>setSelected(s.id)}><th><button type="button" onClick={()=>setSelected(s.id)}>{COMPETITORS[index].name} →</button></th>{FUEL_IDS.map(f=><td key={f} className={s.prices[f]===undefined?'':s.prices[f]!>state.station.fuels[f].retailKopeks?'competitor-more':'competitor-less'}>{s.prices[f]===undefined?'—':(s.stockLitres[f]??0)<=0?'Нет топлива':price(s.prices[f]!)}</td>)}</tr>)}
      </tbody></table></div>
    </>:<>
      <p>{profile?.description} · {profile?.kind==='small'?'Малая одиночная':profile?.kind==='large'?'Крупная одиночная':profile?.kind==='local'?'Местная сеть':'Федеральная сеть'}</p>
      <div className="competitor-fuels">{FUEL_IDS.map(f=><div key={f}><strong>{state.station.fuels[f].name}</strong><span>{station.prices[f]===undefined?'—':(station.stockLitres[f]??0)<=0?'Нет топлива':price(station.prices[f]!)}</span></div>)}</div>
      <h3>История цен</h3><div className="periods">{periods.map(([id,name])=><button key={id} type="button" className={period===id?'active':''} onClick={()=>setPeriod(id)}>{name}</button>)}</div>
      <PriceChart station={station} period={period} now={state.gameSeconds} names={Object.fromEntries(FUEL_IDS.map(f=>[f,state.station.fuels[f].name])) as Record<FuelId,string>}/>
      <div className="competitor-table"><table><thead><tr><th>Игровой день</th>{FUEL_IDS.filter(f=>station.prices[f]!==undefined).map(f=><th key={f}>{state.station.fuels[f].name}</th>)}</tr></thead><tbody>{priceHistory(station,period,state.gameSeconds).map(point=><tr key={point.seconds}><th>{Math.floor(point.seconds/86400)+1}, {String(Math.floor(point.seconds%86400/3600)).padStart(2,'0')}:00</th>{FUEL_IDS.filter(f=>station.prices[f]!==undefined).map(f=><td key={f}>{point.prices[f]===undefined?'—':price(point.prices[f]!)}</td>)}</tr>)}</tbody></table></div>
    </>}</div>
  </section>;
}
