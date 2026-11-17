import { useState } from 'react';
import { Icon } from './Icon';
import { version as currentVersion } from '../../package.json';
import { normalizeStationName } from '../game/domain/stationName';
interface Props { onClose:()=>void; onSection:(name:string)=>void; onReset:()=>void; settings?:boolean; onBack?:()=>void; stationName?:string; onStationName?:(value:string)=>void;onCameraReset?:()=>void;onSaveSlot?:(slot:number)=>boolean;onLoadSlot?:(slot:number)=>boolean;hasSlot?:(slot:number)=>boolean;onExit?:()=>void }
export function GameMenu({onClose,onSection,onReset,settings=false,onBack,stationName='АЗС',onStationName,onCameraReset,onSaveSlot,onLoadSlot,hasSlot,onExit}:Props){
  const [confirmReset,setConfirmReset]=useState(false);
  const [draftName,setDraftName]=useState(stationName);
  return <section className="full-screen" role="dialog" aria-label={settings?'Настройки':'Главное меню'}>
    <header className="screen-header">{settings?<button type="button" onClick={onBack}>← Меню</button>:<span/>}<div><h2>{settings?'Настройки':'Главное меню'}</h2><small>АЗС Simulator · v{currentVersion}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре"><Icon name="close" /></button></header>
    <div className="screen-content menu-content">{settings?<div className="settings-layout"><div className="settings-visual" aria-hidden="true"><div>АЗС</div><span>МАРКЕТ · КАФЕ</span><i>⛽</i></div><div className="settings-fields">
      <div className="settings-card"><h3>Название АЗС</h3><p>До 20 символов. Название светится на фасаде навеса.</p>
        <form onSubmit={event=>{event.preventDefault();const value=normalizeStationName(draftName);setDraftName(value);onStationName?.(value);}}>
          <input aria-label="Название АЗС" value={draftName} onChange={event=>setDraftName(event.target.value)} />
          <button type="submit">Сохранить название</button>
        </form></div>
      <div className="settings-card"><h3>Управление камерой</h3><p>Сдвигайте сцену одним пальцем или мышью. Масштабируйте двумя пальцами или колесом мыши.</p><button type="button" className="panel-action" onClick={onCameraReset}>Сброс камеры</button></div>
      <div className="settings-card"><h3>Версия</h3><p>v{currentVersion}</p></div>
      <div className="settings-card"><h3>Прогресс</h3><div className="slot-grid">{[1,2,3].map(slot=><div key={slot}><strong>Слот {slot}</strong><button type="button" onClick={()=>onSaveSlot?.(slot)}>Сохранить</button><button type="button" disabled={!hasSlot?.(slot)} onClick={()=>{if(window.confirm(`Загрузить слот ${slot}? Текущая игра будет заменена.`))onLoadSlot?.(slot);}}>Загрузить</button></div>)}</div><button type="button" className="menu-reset" onClick={()=>setConfirmReset(true)}>Сбросить прогресс</button></div>
      {confirmReset&&<div className="reset-dialog" role="alertdialog" aria-label="Подтверждение сброса"><h3>Начать новую игру?</h3><p>Деньги, объекты, топливо, статистика и сохранение будут заменены начальным состоянием.</p><div><button type="button" onClick={()=>setConfirmReset(false)}>Отмена</button><button type="button" className="menu-reset" onClick={()=>{onReset();setConfirmReset(false);onClose();}}>Сбросить</button></div></div>}
    </div></div>:<div className="menu-grid">{([['Обзор','Продажи, трафик и остатки','chart'],['Цены','Розничные цены на стеле','tag'],['Конкуренты','Цены и наличие топлива на рынке','traffic'],['Техническая служба','Ремонт, техники и журнал','tasks'],['Магазин и кафе','Торговля, закупки и склады','home'],['Настройки','Управление и версия','settings']] as const).map(([name,description,icon])=><button type="button" key={name} onClick={()=>onSection(name)}><span className="menu-tile-art"><Icon name={icon}/></span><strong>{name}</strong><small>{description}</small></button>)}</div>}{!settings&&<button type="button" className="panel-action" onClick={()=>{if(window.confirm('Сохранить игру и выйти на стартовый экран?'))onExit?.();}}>Выход из игры</button>}</div>
  </section>;
}
