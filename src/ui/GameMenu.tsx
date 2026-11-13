import { useState } from 'react';
import { Icon } from './Icon';
import { version as currentVersion } from '../../package.json';
import { normalizeStationName } from '../game/domain/stationName';
interface Props { onClose:()=>void; onSection:(name:string)=>void; onReset:()=>void; settings?:boolean; onBack?:()=>void; stationName?:string; onStationName?:(value:string)=>void }
export function GameMenu({onClose,onSection,onReset,settings=false,onBack,stationName='АЗС',onStationName}:Props){
  const [confirmReset,setConfirmReset]=useState(false);
  const [draftName,setDraftName]=useState(stationName);
  return <section className="full-screen" role="dialog" aria-label={settings?'Настройки':'Главное меню'}>
    <header className="screen-header">{settings?<button type="button" onClick={onBack}>← Меню</button>:<span/>}<div><h2>{settings?'Настройки':'Главное меню'}</h2><small>АЗС Simulator · v{currentVersion}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре"><Icon name="close" /></button></header>
    <div className="screen-content menu-content">{settings?<>
      <div className="settings-card"><h3>Название АЗС</h3><p>До 20 символов. Название светится на фасаде навеса.</p>
        <form onSubmit={event=>{event.preventDefault();const value=normalizeStationName(draftName);setDraftName(value);onStationName?.(value);}}>
          <input aria-label="Название АЗС" value={draftName} onChange={event=>setDraftName(event.target.value)} />
          <button type="submit">Сохранить название</button>
        </form></div>
      <div className="settings-card"><h3>Управление камерой</h3><p>Сдвигайте сцену одним пальцем или мышью. Масштабируйте двумя пальцами или колесом мыши. Кнопка «Сброс камеры» возвращает исходный вид.</p></div>
      <div className="settings-card"><h3>Версия</h3><p>v{currentVersion}</p></div>
      <div className="settings-card"><h3>Прогресс</h3><button type="button" className="menu-reset" onClick={()=>setConfirmReset(true)}>Сбросить прогресс</button></div>
      {confirmReset&&<div className="reset-dialog" role="alertdialog" aria-label="Подтверждение сброса"><h3>Начать новую игру?</h3><p>Деньги, объекты, топливо, статистика и сохранение будут заменены начальным состоянием.</p><div><button type="button" onClick={()=>setConfirmReset(false)}>Отмена</button><button type="button" className="menu-reset" onClick={()=>{onReset();setConfirmReset(false);onClose();}}>Сбросить</button></div></div>}
    </>:<div className="menu-grid">{[['Обзор','Продажи, трафик и остатки'],['Цены','Розничные цены на стеле'],['Конкуренты','Цены и наличие топлива на рынке'],['Настройки','Управление и версия']] .map(([name,description])=><button type="button" key={name} onClick={()=>onSection(name)}><strong>{name}</strong><small>{description}</small></button>)}</div>}</div>
  </section>;
}
