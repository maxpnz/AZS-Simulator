import { useMemo, useState } from 'react';
import type { GameState } from '../game/domain/types';
import { condition, CONTRACTORS, estimateRepair, LEVELS, TECH_NAMES } from '../game/domain/technical';
import type { AutomationMode } from '../game/domain/technical';
import { getClock } from '../game/simulation/time';
import type { GameEngine } from '../game/simulation/GameEngine';
const money=(kopeks:number)=>(kopeks/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const duration=(seconds:number)=>`${Math.floor(seconds/3600)} ч ${Math.ceil(seconds%3600/60)} мин`;
const phases={travel:'Техник в пути',waiting:'Ожидание освобождения',working:'Ремонт',departing:'Возвращается'};
interface Props {state:GameState;engine:GameEngine;focusedId?:string|null;refresh:()=>void;onClose:()=>void;onBack:()=>void}
export function TechnicalPanel({state,engine,focusedId,refresh,onClose,onBack}:Props){
  const tech=state.technical!;
  const [name,setName]=useState('');const [selected,setSelected]=useState('');const [equipmentFilter,setEquipmentFilter]=useState('');
  const [executorFilter,setExecutorFilter]=useState('');const [period,setPeriod]=useState(Infinity);const [error,setError]=useState('');
  const equipment=[...state.station.pumps.map(item=>({item,kind:'pump' as const})),...state.station.tanks.map(item=>({item,kind:'tank' as const}))]
    .filter(({item})=>item.status!=='building').sort((a,b)=>condition(a.item)-condition(b.item));
  const act=(ok:boolean)=>{if(!ok)setError('Действие недоступно: проверьте состояние объекта, занятость сотрудника и баланс.');else setError('');refresh();};
  const clock=(seconds:number)=>{const c=getClock(seconds);return `День ${c.day}, ${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;};
  const history=tech.history.filter(h=>(!equipmentFilter||h.equipmentId===equipmentFilter)&&(!executorFilter||h.technicianId===executorFilter||h.executorName===executorFilter)&&(period===Infinity||h.gameSeconds>=state.gameSeconds-period));
  const namesKey=tech.technicians.map(t=>t.name).join('|');
  const suggestion=useMemo(()=>{const available=TECH_NAMES.filter(n=>!namesKey.split('|').includes(n));return available[Math.floor(Math.random()*available.length)]??'Техник';},[namesKey]);
  const recommendations=equipment.filter(({item})=>condition(item)<100&&!tech.tasks.some(t=>t.equipmentId===item.id));
  return <section className="full-screen technical-screen" role="dialog" aria-label="Техническая служба">
    <header className="screen-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>Техническая служба</h2><small>Ремонт и персонал</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре">×</button></header>
    <div className="screen-content technical-content">
      <h3>Режим</h3><div className="periods">{([['automatic','Автоматический ремонт и профилактика'],['critical','Только критический ремонт'],['manual','Ручное управление']] as [AutomationMode,string][]).map(([mode,label])=><button type="button" key={mode} className={tech.mode===mode?'active':''} onClick={()=>act(engine.setAutomation(mode))}>{label}</button>)}</div>
      <div className="technical-columns"><div className="technical-personnel">      <h3>Сотрудники · {tech.technicians.length}/3</h3><div className="tech-hire"><input aria-label="Имя нового техника" maxLength={24} value={name} placeholder={suggestion} onChange={e=>setName(e.target.value)}/><button type="button" disabled={tech.technicians.length>=3||state.station.balanceKopeks<200000} onClick={()=>{act(engine.hireTechnician(name.trim()||suggestion));setName('');}}>Нанять · 2 000 ₽</button></div>
      <div className="tech-grid">{tech.technicians.map(t=>{const task=tech.tasks.find(job=>job.technicianId===t.id);return <article className={`tech-card ${focusedId===t.id?'focused':''}`} key={t.id}>
        <h4>{t.name} <small>{LEVELS[t.level-1].name}</small></h4><p>{money(LEVELS[t.level-1].salary*100)}/сутки · скорость {LEVELS[t.level-1].speed}×</p>
        <p>{t.phase==='training'?`Обучение: ${duration(t.trainingRemaining)}`:t.phase==='returning'?'Возвращается в здание':task?`${task.equipmentId}: ${phases[task.phase]}${task.phase==='working'?` ${Math.round((1-task.phaseRemaining/task.durationSeconds)*100)}%`:''}`:'Свободен в служебном здании'}</p>
        <div className="tech-actions"><button type="button" onClick={()=>{const value=window.prompt('Новое имя (до 24 символов)',t.name);if(value!==null)act(engine.renameTechnician(t.id,value));}}>Имя</button>
          <button type="button" disabled={t.level>=5||t.phase==='training'||!!task?.paid} onClick={()=>{if(task?.source==='manual'&&!window.confirm('Отменить ручное назначение и начать обучение?'))return;act(engine.trainTechnician(t.id));}}>Обучить · {t.level<5?money(LEVELS[t.level].training*100):'максимум'}</button>
          <button type="button" disabled={t.phase==='training'||!!task?.paid} onClick={()=>{if(!window.confirm(`Уволить ${t.name}?`))return;act(engine.fireTechnician(t.id));}}>Уволить</button></div>
        <select aria-label={`Объект для ${t.name}`} value={selected.startsWith(t.id+':')?selected.split(':')[1]:''} onChange={e=>setSelected(`${t.id}:${e.target.value}`)}><option value="">Выбрать объект для ремонта</option>{equipment.map(({item,kind})=><option key={item.id} value={item.id} disabled={!!tech.tasks.find(job=>job.equipmentId===item.id)}>{item.id} · {condition(item).toFixed(1)}% · {money(estimateRepair(kind,condition(item)).partsKopeks)} · {duration(estimateRepair(kind,condition(item),LEVELS[t.level-1].speed).durationSeconds)}</option>)}</select>
        <button type="button" disabled={!selected.startsWith(t.id+':')||!!task?.paid||t.phase==='training'||condition(equipment.find(e=>e.item.id===selected.split(':')[1])?.item??{condition:100} as typeof equipment[number]['item'])>=100} onClick={()=>act(engine.assignRepair(selected.split(':')[1],t.id))}>Назначить ремонт</button>
      </article>;})}</div>
</div><div className="technical-equipment">      <h3>Оборудование и очередь</h3><div className="tech-grid">{equipment.map(({item,kind})=>{const task=tech.tasks.find(t=>t.equipmentId===item.id);const estimate=estimateRepair(kind,condition(item));return <article className="tech-card" key={item.id}>
        <h4>{kind==='pump'?'ТРК':'Резервуар'} · {item.id}</h4><p>Состояние: <strong>{condition(item).toFixed(2)}%</strong> · запчасти {money(estimate.partsKopeks)} · {duration(estimate.durationSeconds)}</p>
        {task?<><p>{task.paid||task.blocked!==false?task.contractor&&task.phase==='travel'?'Подрядчик в пути':phases[task.phase]:'Ремонт назначен'} · {task.executorName}{task.phase==='working'?` · ${Math.round((1-task.phaseRemaining/task.durationSeconds)*100)}%`:''}</p>
          {!task.paid&&task.source==='manual'&&<button type="button" onClick={()=>act(engine.cancelRepair(item.id))}>Отменить назначение</button>}</>:<div className="tech-actions">{Object.entries(CONTRACTORS).map(([type,contractor])=><button type="button" key={type} disabled={condition(item)>=100||state.station.balanceKopeks<estimate.partsKopeks+contractor.call*100} onClick={()=>act(engine.callContractor(item.id,type as keyof typeof CONTRACTORS))}>{contractor.name} · {money(estimate.partsKopeks+contractor.call*100)}</button>)}</div>}
        {!task&&condition(item)===100&&<p>Обслуживание не требуется.</p>}
      </article>;})}</div>
</div><div className="technical-recommendations">      <h3>Рекомендации · {recommendations.length}</h3><p>{recommendations.length?recommendations.map(({item})=>`${item.id} — ${condition(item).toFixed(1)}%`).join(' · '):'Обслуживание пока не требуется.'}</p>
</div></div>
      <h3>Журнал ремонтов</h3><div className="tech-filters"><select aria-label="Фильтр оборудования" value={equipmentFilter} onChange={e=>setEquipmentFilter(e.target.value)}><option value="">Все объекты</option>{equipment.map(({item})=><option key={item.id}>{item.id}</option>)}</select><select aria-label="Фильтр исполнителя" value={executorFilter} onChange={e=>setExecutorFilter(e.target.value)}><option value="">Все исполнители</option>{[...new Set(tech.history.map(h=>h.technicianId??h.executorName))].map(id=><option key={id} value={id}>{tech.history.find(h=>(h.technicianId??h.executorName)===id)?.executorName}</option>)}</select><select aria-label="Период журнала" value={period} onChange={e=>setPeriod(Number(e.target.value))}><option value={86400}>День</option><option value={604800}>Неделя</option><option value={2592000}>Месяц</option><option value={Infinity}>Всё время</option></select></div>
      {history.length?history.map(h=><div className="finance-line" key={h.id}><span>{clock(h.gameSeconds)} · {h.equipmentId} · {h.conditionBefore.toFixed(1)}% → 100% · {h.executorName}{h.technicianId?` (${h.technicianId})`:''} · {h.source==='manual'?'ручной':'автоматический'} · {duration(h.durationSeconds)} · запчасти {money(h.partsKopeks)}{h.callKopeks?` · вызов ${money(h.callKopeks)}`:''}</span><b>{money(h.partsKopeks+h.callKopeks)}</b></div>):<p>Завершённых ремонтов нет.</p>}
      {error&&<p role="alert" className="panel-error">{error}</p>}
    </div>
  </section>;
}
