import { useState } from 'react';
import { FUEL_IDS, INITIAL_STATION, MAX_FUELS_PER_PUMP } from '../game/domain/config';
import { ECONOMY, supplierOffer, SUPPLIERS } from '../game/domain/economy';
import type { FuelId, GameState, Vehicle } from '../game/domain/types';
import type { ObjectId } from './scene/createStationScene';
import { version as currentVersion } from '../../package.json';
const litres=(ml:number,precision=3)=>(ml/1000).toLocaleString('ru-RU',{minimumFractionDigits:precision,maximumFractionDigits:precision})+' л';
const rubles=(kop:number)=>(kop/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
interface Props {
  id:ObjectId;state:GameState;prices:Record<FuelId,number>;vehicles:readonly Vehicle[];
  onPrice:(fuel:FuelId,kopeks:number)=>void;onBuildPump:(slot:number)=>boolean;onUpgradePump:(id:string)=>boolean;
  onSetPumpEnabled:(id:string,enabled:boolean)=>boolean;
  onSetPumpFuels:(id:string,fuels:FuelId[])=>boolean;onBuildTank:(fuel:FuelId)=>boolean;onUpgradeTank:(id:string)=>boolean;
  onDelivery:(supplierId:string,sections:readonly {fuel:FuelId;litres:number}[])=>boolean;onClose:()=>void;
}
export function ObjectPanel({id,state,prices,vehicles,onPrice,onBuildPump,onUpgradePump,onSetPumpEnabled,onSetPumpFuels,onBuildTank,onUpgradeTank,onDelivery,onClose}:Props) {
  const station=state.station;
  const slot=id.startsWith('slot-')?Number(id.slice(5)):id.startsWith('pump-')?Number(id.slice(5))-1:-1;
  const pump=station.pumps.find(p=>p.slot===slot);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [chosenFuel,setChosenFuel]=useState<FuelId>('ai92');const [deliveryLitres,setDeliveryLitres]=useState(500);
  const [supplierId,setSupplierId]=useState('regional');
  const [secondFuel,setSecondFuel]=useState<FuelId|'none'>('none');const [secondLitres,setSecondLitres]=useState(500);
  const [thirdFuel,setThirdFuel]=useState<FuelId|'none'>('none');const [thirdLitres,setThirdLitres]=useState(500);
  const [channels,setChannels]=useState<FuelId[]>(()=>[...(pump?.fuels??['ai92','ai95'])]);
  const serving=pump?vehicles.find(v=>v.pumpId===pump.id&&(v.status==='fueling'||v.status==='finishing')):undefined;
  const pumpBusy=pump?vehicles.some(v=>v.pumpId===pump.id&&['toPump','fueling','finishing','leaving'].includes(v.status)):false;
  const activeFuels=FUEL_IDS.filter(f=>station.tanks.some(t=>t.fuel===f&&t.status==='active'));
  const cargoEntries:[[FuelId,number],...[FuelId,number][]]=[[chosenFuel,deliveryLitres],
    ...(secondFuel==='none'?[]:[[secondFuel,secondLitres] as [FuelId,number]]),
    ...(thirdFuel==='none'?[]:[[thirdFuel,thirdLitres] as [FuelId,number]])];
  const offerFor=(fuel:FuelId)=>{
    const offer=supplierOffer(supplierId,fuel,state.gameSeconds,station.fuels[fuel].wholesaleKopeks);
    const day=Math.floor(state.gameSeconds/ECONOMY.gameDaySeconds);
    const reserved=state.supplierReservedLitres?.[`${day}:${supplierId}:${fuel}`]??0;
    return offer?{...offer,availableLitres:Math.max(0,offer.availableLitres-reserved)}:undefined;
  };
  const orderCost=cargoEntries.reduce((sum,[fuel,amount])=>sum+amount*(offerFor(fuel)?.priceKopeks??0),0);
  const requestedByFuel=(fuel:FuelId)=>cargoEntries.filter(([id])=>id===fuel).reduce((sum,[,amount])=>sum+amount,0);
  const freeFor=(fuel:FuelId)=>station.tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-
    (state.deliveries??[]).reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
  const validCargo=cargoEntries.every(([fuel,amount])=>Number.isInteger(amount)&&amount>0&&amount<=8_000&&
    requestedByFuel(fuel)<=(offerFor(fuel)?.availableLitres??0)&&requestedByFuel(fuel)*1000<=freeFor(fuel))&&
    orderCost<=station.balanceKopeks;
  const name=slot>=0?pump?`Колонка №${slot+1}`:`Монтажное место №${slot+1}`:
    id==='price-sign'?'Стела с ценами':id==='tank'?'Резервуары':id==='delivery'?'Зона разгрузки':id==='shop'?'Магазин':'Строительство';
  const act=(success:boolean,message:string)=>{if(success){setNotice(message);setError('');}else setError('Действие недоступно: проверьте баланс, занятость, вместимость и наличие бригады.');};
  return <div className="object-panel" role="dialog" aria-label={name}>
    <div className="object-heading"><div><small>v{currentVersion} · ЖИВАЯ СИМУЛЯЦИЯ</small><h2>{name}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть карточку">×</button></div>
    {id==='price-sign'&&<>
      <p>Цены влияют на фактическую выручку. Погасшая цена означает, что топлива нет в доступном резервуаре.</p>
      {FUEL_IDS.map(fuel=><div className="price-row" key={fuel}><span>{station.fuels[fuel].name}</span>
        <button type="button" aria-label={`Уменьшить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]<=100} onClick={()=>onPrice(fuel,prices[fuel]-10)}>−</button>
        <strong>{(prices[fuel]/100).toFixed(2)} ₽</strong>
        <button type="button" aria-label={`Увеличить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]>=99900} onClick={()=>onPrice(fuel,prices[fuel]+10)}>+</button>
        <small>{station.fuels[fuel].stockMl>0?'В продаже':'Нет топлива'}</small></div>)}
    </>}
    {slot>=0&&<>
      <p>Опора {Math.floor(slot/2)+1}, {slot%2?'правая':'левая'} сторона · место {slot+1} из 10.</p>
      {pump?<>
        <p>Состояние: {pump.status==='building'?'строится':pump.status==='upgrading'?'модернизируется':'готова'}.
          Каналы: {pump.fuels.map(f=>station.fuels[f].name).join(', ')}. Производительность ×{(pump.flowMultiplier??1).toFixed(1)}.</p>
        {serving&&<div className="pump-readout"><span>Литры: {litres(serving.deliveredMl,2)}</span><span>Стоимость: {rubles(serving.chargedKopeks)}</span>
          <span>Цена: {rubles(serving.salePriceKopeks)}/л</span></div>}
        {!serving&&<p>Показания появятся после начала подачи топлива.</p>}
        <button type="button" className="panel-action" disabled={pump.status!=='ready'||(pump.enabled!==false&&pumpBusy)}
          onClick={()=>act(onSetPumpEnabled(pump.id,pump.enabled===false),pump.enabled===false?'ТРК включена.':'ТРК выключена.')}>{pump.enabled===false?'Включить ТРК':'Выключить ТРК'}</button>
        <button type="button" className="panel-action" disabled={pump.status==='building'||pump.status==='upgrading'||pumpBusy} onClick={()=>act(onUpgradePump(pump.id),'Модернизация поставлена в очередь.')}>Модернизировать · 12 000 ₽</button>
        <h3>Подключённые пистолеты</h3>
        <div className="fuel-choice">{activeFuels.map(f=><label key={f}><input type="checkbox" checked={channels.includes(f)} onChange={e=>setChannels(old=>e.target.checked?[...old,f].slice(0,MAX_FUELS_PER_PUMP):old.filter(x=>x!==f))}/>{station.fuels[f].name}</label>)}</div>
        <button type="button" className="panel-action" disabled={pump.status==='building'||pump.status==='upgrading'||pumpBusy} onClick={()=>act(onSetPumpFuels(pump.id,channels),'Переподключение займёт 3 игровые минуты.')}>Переподключить каналы</button>
      </>:<button type="button" className="panel-action" onClick={()=>act(onBuildPump(slot),'Строительство ТРК поставлено в очередь.')}>Построить ТРК · 25 000 ₽</button>}
      {(station.jobs??[]).filter(j=>j.targetId===pump?.id).map(j=><p key={j.id}>{j.status==='active'?'Бригада работает':'Ожидает бригаду'} · {Math.ceil(j.remainingSeconds)} игровых с</p>)}
    </>}
    {id==='tank'&&<>
      <p>Каждый резервуар расположен под землёй. На сцене видны технологические люки; заполнение показано в разрезе ниже.</p>
      {station.tanks.map(t=>{const ratio=t.capacityMl?t.stockMl/t.capacityMl:0;return <div className="tank-card" key={t.id}>
        <strong>{station.fuels[t.fuel].name} · {t.id}</strong><span>{litres(t.stockMl)} из {litres(t.capacityMl)}</span>
        <div className="tank-cutaway"><div style={{width:`${Math.max(0,Math.min(100,ratio*100))}%`}}/></div>
        <small>{t.status==='active'?'Работает':t.status==='building'?'Строится':'Модернизируется'}</small>
        <button type="button" className="panel-action" disabled={t.status!=='active'} onClick={()=>act(onUpgradeTank(t.id),'Модернизация резервуара поставлена в очередь.')}>Увеличить ёмкость · 20 000 ₽</button>
      </div>;})}
      <h3>Новый резервуар</h3><select value={chosenFuel} onChange={e=>setChosenFuel(e.target.value as FuelId)}>{FUEL_IDS.map(f=><option key={f} value={f}>{INITIAL_STATION.fuels[f].name}</option>)}</select>
      <button type="button" className="panel-action" onClick={()=>act(onBuildTank(chosenFuel),'Строительство резервуара поставлено в очередь.')}>Построить · 40 000 ₽</button>
    </>}
    {id==='delivery'&&<>
      <p>Выберите поставщика и до трёх сортов. Каждая секция вмещает до 8000 л, общий объём — до 24 000 л. Цена закрепляется при заказе. Слив: 36 л за реальную секунду при 1×, без учёта подъезда и подключения.</p>
      <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} aria-label="Поставщик">{SUPPLIERS.map(s=><option key={s.id} value={s.id}>{s.name} · {s.etaGameSeconds/3600} игровых ч</option>)}</select>
      {([[chosenFuel,deliveryLitres,setChosenFuel,setDeliveryLitres],[secondFuel,secondLitres,setSecondFuel,setSecondLitres],[thirdFuel,thirdLitres,setThirdFuel,setThirdLitres]] as const).map(([fuel,amount,setFuel,setAmount],index)=><div className="delivery-section" key={index}>
        <select value={fuel} onChange={e=>setFuel(e.target.value as FuelId & 'none')} aria-label={`Сорт секции ${index+1}`}>
          {index>0&&<option value="none">Без секции</option>}{FUEL_IDS.map(f=><option key={f} value={f}>{station.fuels[f].name}</option>)}
        </select>
        {fuel!=='none'&&<><input type="number" min="1" max="8000" value={amount} onChange={e=>setAmount(Number(e.target.value))} aria-label={`Литры секции ${index+1}`}/>
          <small>Поставщик: {offerFor(fuel)?.availableLitres??0} л · свободно у нас: {Math.max(0,Math.floor(freeFor(fuel)/1000))} л · {rubles(offerFor(fuel)?.priceKopeks??0)}/л</small></>}
      </div>)}
      {!station.tanks.some(t=>t.status==='active')&&<p>Перед заказом постройте резервуар нужного сорта.</p>}
      <button type="button" className="panel-action" disabled={!validCargo} onClick={()=>act(onDelivery(supplierId,cargoEntries.map(([fuel,amount])=>({fuel,litres:amount}))),'Поставка заказана.')}>Заказать · {rubles(orderCost)}</button>
      {state.deliveries?.map(d=><p key={d.id}>{d.id} · {SUPPLIERS.find(s=>s.id===d.supplierId)?.name??'Поставка'}: {{enroute:'в пути',waiting:'ожидает площадку',approaching:'подъезжает',connecting:'подключает рукав',unloading:'разгрузка',disconnecting:'отключает рукав',leaving:'выезжает'}[d.status??'enroute']} · осталось {litres(d.remainingMl??0,0)} · слив ~{Math.ceil((d.remainingMl??0)/(ECONOMY.unloadMlPerGameSecond*60))} реальных с при 1×</p>)}
    </>}
    {id==='expansion'&&<><p>Две строительные бригады. Новые ТРК приобретаются через пустые монтажные места под навесом; резервуары — через карточку люков.</p>
      {(station.jobs??[]).map(j=><p key={j.id}>{j.targetId}: {j.status==='active'?'в работе':'в очереди'} · {Math.ceil(j.remainingSeconds)} игровых с</p>)}</>}
    {id==='shop'&&<p>Магазин пока декоративный объект станции. Продажи магазина в экономике не учитываются.</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="panel-error" role="alert">{error}</p>}
  </div>;
}
