import type { SlotMetadata } from '../game/simulation/GameEngine';
import { getClock } from '../game/simulation/time';
import { toast } from './Toast';
import { useState } from 'react';
import { Icon } from './Icon';
import { version as currentVersion } from '../../package.json';
import { normalizeStationName } from '../game/domain/stationName';
import menuStationArt from '../assets/menu-station-v072.webp';
import commerceArt from '../assets/commerce-interior-v072.webp';
import workshopArt from '../assets/workshop-v072.webp';
import priceSignArt from '../assets/v025/price-sign.webp';
import { audio, type AudioBus } from '../audio/AudioManager';
interface Props { onClose:()=>void; onSection:(name:string)=>void; onReset:()=>void; settings?:boolean; onBack?:()=>void; stationName?:string; onStationName?:(value:string)=>void;onCameraReset?:()=>void;onSaveSlot?:(slot:number)=>boolean;onLoadSlot?:(slot:number)=>boolean;getSlot?:(slot:number)=>SlotMetadata|null;onExit?:()=>void }
export function GameMenu({onClose,onSection,onReset,settings=false,onBack,stationName='АЗС',onStationName,onCameraReset,onSaveSlot,onLoadSlot,getSlot,onExit}:Props){
  const [,refreshSlots]=useState(0);
  const [confirmReset,setConfirmReset]=useState(false);
  const [draftName,setDraftName]=useState(stationName);
  const [volumes,setVolumes]=useState<Record<AudioBus,number>>({music:audio.getVolume('music'),effects:audio.getVolume('effects'),ambient:audio.getVolume('ambient'),cars:audio.getVolume('cars'),trucks:audio.getVolume('trucks'),notifications:audio.getVolume('notifications')});
  return <section className="full-screen" role="dialog" aria-label={settings?'Настройки':'Главное меню'}>
    <header className="screen-header">{settings?<button type="button" onClick={onBack}>← Меню</button>:<span/>}<div><h2>{settings?'Настройки':'Главное меню'}</h2><small>АЗС Simulator · v{currentVersion}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре"><Icon name="close" /></button></header>
    <div className="screen-content menu-content">{settings?<div className="settings-layout"><div className="settings-visual" aria-hidden="true"><img src={menuStationArt} alt="" /><span>АЗС Simulator</span></div><div className="settings-fields">
      <div className="settings-card"><h3>Название АЗС</h3><p>До 20 символов. Название светится на фасаде навеса.</p>
        <form onSubmit={event=>{event.preventDefault();const value=normalizeStationName(draftName);setDraftName(value);onStationName?.(value);}}>
          <input aria-label="Название АЗС" value={draftName} onChange={event=>setDraftName(event.target.value)} />
          <button type="submit">Сохранить название</button>
        </form></div>
      <div className="settings-card"><h3>Управление камерой</h3><p>Сдвигайте сцену одним пальцем или мышью. Масштабируйте двумя пальцами или колесом мыши.</p><button type="button" className="panel-action" onClick={onCameraReset}>Сброс камеры</button></div>
      <div className="settings-card"><h3>Звук</h3><p>Уровни сохраняются автоматически. 0% отключает соответствующую шину.</p>
        {([['music','Музыка'],['ambient','Среда и работы'],['cars','Легковые'],['trucks','Грузовые'],['effects','Кнопки'],['notifications','Уведомления и продажи']] as const).map(([bus,label])=><label className="audio-volume" key={bus}><span>{label}<strong>{volumes[bus]}%</strong></span><input type="range" min="0" max="100" step="1" value={volumes[bus]} aria-label={label} onChange={event=>{const value=Number(event.target.value);audio.setVolume(bus,value);setVolumes(current=>({...current,[bus]:value}));}} /></label>)}
      </div>
      <div className="settings-card"><h3>Музыка и права</h3><p>«Funky Boxstep» — Kevin MacLeod (<a href="https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN2100011" target="_blank" rel="noopener noreferrer">incompetech.com</a>). Лицензия <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Файл для игры перекодирован в OGG Vorbis 64 кбит/с.</p></div>
      <div className="settings-card"><h3>Версия</h3><p>v{currentVersion}</p></div>
      <div className="settings-card"><h3>Прогресс</h3><div className="slot-grid">{[1,2,3].map(slot=>{
        const metadata=getSlot?.(slot);
        const clock=metadata?getClock(metadata.gameSeconds):null;
        return <article className="save-slot" key={slot}>
          <strong>Слот {slot}</strong>
          {metadata&&clock?<><b>{metadata.name}</b><small>День {clock.day} · {String(clock.hour).padStart(2,'0')}:{String(clock.minute).padStart(2,'0')}</small><small>{metadata.savedAt===undefined?'Время неизвестно':new Date(metadata.savedAt).toLocaleString('ru-RU')}</small></>:<small>Пустой слот</small>}
          <div className="save-slot-actions">
            <button className="panel-action" type="button" onClick={()=>{
              if(metadata&&!window.confirm(`Перезаписать слот ${slot}?`))return;
              const ok=onSaveSlot?.(slot);
              if(ok)refreshSlots(n=>n+1);
              toast(ok?`Игра сохранена в слот ${slot}.`:'Не удалось записать сохранение.',ok?'success':'error');
            }}>Сохранить</button>
            <button className="panel-action" type="button" disabled={!metadata} onClick={()=>{
              if(!window.confirm(`Загрузить слот ${slot}? Текущая игра будет заменена.`))return;
              const ok=onLoadSlot?.(slot);
              if(ok)setDraftName(getSlot?.(slot)?.name??'АЗС');
              toast(ok?`Слот ${slot} загружен.`:'Не удалось загрузить сохранение.',ok?'success':'error');
            }}>Загрузить</button>
          </div>
        </article>;
      })}</div><button type="button" className="menu-reset" onClick={()=>setConfirmReset(true)}>Сбросить прогресс</button></div>
      {confirmReset&&<div className="reset-dialog" role="alertdialog" aria-label="Подтверждение сброса"><h3>Начать новую игру?</h3><p>Деньги, объекты, топливо, статистика и сохранение будут заменены начальным состоянием.</p><div><button type="button" onClick={()=>setConfirmReset(false)}>Отмена</button><button type="button" className="menu-reset" onClick={()=>{onReset();setConfirmReset(false);onClose();}}>Сбросить</button></div></div>}
    </div></div>:<><div className="menu-hero" style={{backgroundImage:`linear-gradient(90deg,#06131dee 0%,#06131dbb 34%,#06131d05 75%),url(${menuStationArt})`}}><div><span>УПРАВЛЕНИЕ АЗС</span><h3>АЗС <em>Simulator</em></h3><p>Выберите раздел станции</p></div></div><div className="menu-grid">{([['Обзор','Продажи, трафик и остатки','chart'],['Цены','Розничные цены на стеле','tag'],['Конкуренты','Цены и наличие топлива на рынке','traffic'],['Техническая служба','Внешние мастера и журнал','tasks'],['Магазин','Товары, закупки и склад','home'],['Кафе','Напитки, выпечка и закупки','home'],['Настройки','Управление и версия','settings']] as const).map(([name,description,icon],index)=><button type="button" key={name} onClick={()=>onSection(name)} className={`menu-tile menu-tile-${index}`}><img className="menu-tile-photo" src={[menuStationArt,priceSignArt,menuStationArt,workshopArt,commerceArt,'/app-icon.png'][index]} alt="" /><span className="menu-tile-art"><Icon name={icon}/></span><span className="menu-tile-copy"><strong>{name}</strong><small>{description}</small></span><span className="menu-tile-arrow" aria-hidden="true">↗</span></button>)}</div></>}{!settings&&<button type="button" className="panel-action menu-exit-button" onClick={()=>{if(window.confirm('Сохранить игру и выйти на стартовый экран?'))onExit?.();}}>Выход из игры</button>}</div>
  </section>;
}
