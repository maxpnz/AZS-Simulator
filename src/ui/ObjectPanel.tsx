import { useRef, useState } from 'react';
import { FUEL_IDS, INITIAL_STATION, MAX_FUELS_PER_PUMP } from '../game/domain/config';
import { marketOffer, nefteoptDiscount, NEFTEOPT, SUPPLIERS } from '../game/domain/market';
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
  onDelivery:(supplierId:string,sections:readonly {fuel:FuelId;litres:number}[])=>boolean;onClose:()=>void;onBack:()=>void;onCompetitors:()=>void;
}
export function ObjectPanel({id,state,prices,vehicles,onPrice,onBuildPump,onUpgradePump,onSetPumpEnabled,onSetPumpFuels,onBuildTank,onUpgradeTank,onDelivery,onClose,onBack,onCompetitors}:Props) {
  const station=state.station;
  const slot=id.startsWith('slot-')?Number(id.slice(5)):id.startsWith('pump-')?Number(id.slice(5))-1:-1;
  const pump=station.pumps.find(p=>p.slot===slot);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [chosenFuel,setChosenFuel]=useState<FuelId>('ai92');const [deliveryLitres,setDeliveryLitres]=useState(500);
  const [supplierId,setSupplierId]=useState('regional');
  const [secondFuel,setSecondFuel]=useState<FuelId|'none'>('none');const [secondLitres,setSecondLitres]=useState(500);
  const [thirdFuel,setThirdFuel]=useState<FuelId|'none'>('none');const [thirdLitres,setThirdLitres]=useState(500);
  const [orderStep,setOrderStep]=useState(100);
  const [submitting,setSubmitting]=useState(false);
  const submittingRef=useRef(false);
  const [channels,setChannels]=useState<FuelId[]>(()=>[...(pump?.fuels??[])]);
  const serving=pump?vehicles.find(v=>v.pumpId===pump.id&&(v.status==='fueling'||v.status==='finishing')):undefined;
  const pumpBusy=pump?vehicles.some(v=>v.pumpId===pump.id&&['toPump','fueling','finishing','leaving'].includes(v.status)):false;
  const activeFuels=FUEL_IDS.filter(f=>station.tanks.some(t=>t.fuel===f&&t.status==='active'));
  const cargoEntries:[[FuelId,number],...[FuelId,number][]]=[[chosenFuel,deliveryLitres],
    ...(secondFuel==='none'?[]:[[secondFuel,secondLitres] as [FuelId,number]]),
    ...(thirdFuel==='none'?[]:[[thirdFuel,thirdLitres] as [FuelId,number]])];
  const offerFor=(fuel:FuelId)=>{
    return state.market?marketOffer(state.market,supplierId,fuel,state.gameSeconds):undefined;
  };
  const totalLitres=cargoEntries.reduce((sum,[,amount])=>sum+amount,0),bulk=supplierId==='nefteopt';
  const discount=bulk?nefteoptDiscount(totalLitres):0;
  const orderCost=cargoEntries.reduce((sum,[fuel,amount])=>sum+amount*(bulk?Math.round((state.market?.baseKopeks[fuel]??0)*(1-discount)):(offerFor(fuel)?.priceKopeks??0)),0);
  const requestedByFuel=(fuel:FuelId)=>cargoEntries.filter(([id])=>id===fuel).reduce((sum,[,amount])=>sum+amount,0);
  const freeFor=(fuel:FuelId)=>station.tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-
    (state.deliveries??[]).reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
  const validCargo=totalLitres<=(bulk?NEFTEOPT.maxLitres:24000)&&(!bulk||totalLitres>=NEFTEOPT.minLitres)&&cargoEntries.every(([fuel,amount])=>Number.isInteger(amount)&&amount>0&&amount<=(bulk?NEFTEOPT.maxLitres:8_000)&&
    requestedByFuel(fuel)<=(offerFor(fuel)?.availableLitres??0)&&requestedByFuel(fuel)*1000<=freeFor(fuel))&&
    orderCost<=station.balanceKopeks;
  const orderProblem=(bulk&&totalLitres<NEFTEOPT.minLitres?`Минимальный заказ НефтеОпт — ${NEFTEOPT.minLitres.toLocaleString('ru-RU')} л.`:totalLitres>(bulk?NEFTEOPT.maxLitres:24000)?'Превышен объём бензовоза.':'')||cargoEntries.map(([fuel])=>{
    const name=station.fuels[fuel].name,stock=offerFor(fuel)?.availableLitres??0,free=freeFor(fuel);
    if(requestedByFuel(fuel)<=0)return `Выберите объём ${name} больше нуля.`;
    if(!stock)return `У поставщика нет ${name}. Выберите другого поставщика или дождитесь пополнения склада.`;
    if(requestedByFuel(fuel)>stock)return `У поставщика доступно только ${stock.toLocaleString('ru-RU')} л ${name}.`;
    if(!station.tanks.some(t=>t.fuel===fuel&&t.status==='active'))return `Постройте резервуар для ${name}.`;
    if(requestedByFuel(fuel)*1000>free)return `Недостаточно свободного места в резервуаре ${name}.`;
    return '';
  }).find(Boolean)|| (orderCost>station.balanceKopeks?'Недостаточно денег для заказа.':'');
  const name=slot>=0?pump?`Колонка №${slot+1}`:`Монтажное место №${slot+1}`:
    id==='price-sign'?'Стела с ценами':id==='tank'?'Резервуары':id==='delivery'?'Зона разгрузки':id==='shop'?'Магазин':'Строительство';
  const act=(success:boolean,message:string)=>{if(success){setNotice(message);setError('');}else setError('Действие недоступно: проверьте баланс, занятость, вместимость и наличие бригады.');};
  return <section className="full-screen" role="dialog" aria-label={name}>
    <header className="screen-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>{name}</h2><small>АЗС Simulator · v{currentVersion}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре">×</button></header>
    <div className="screen-content object-panel">
    {id==='price-sign'&&<>
      <p>Цены влияют на фактическую выручку. Погасшая цена означает, что топлива нет в доступном резервуаре.</p>
      <button type="button" className="panel-action" onClick={onCompetitors}>Цены конкурентов →</button>
      {FUEL_IDS.map(fuel=><div className="price-row" key={fuel}><span>{station.fuels[fuel].name}</span>
        <button type="button" aria-label={`Уменьшить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]<=100} onClick={()=>onPrice(fuel,prices[fuel]-10)}>−</button>
        <strong>{(prices[fuel]/100).toFixed(2)} ₽</strong>
        <button type="button" aria-label={`Увеличить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]>=99900} onClick={()=>onPrice(fuel,prices[fuel]+10)}>+</button>
        <small>{station.fuels[fuel].stockMl>0?`Рынок: ${rubles(state.market?.competitorKopeks[fuel]??prices[fuel])}/л`:'Нет топлива'}</small></div>)}
    </>}
    {slot>=0&&<>
      <p>Опора {Math.floor(slot/2)+1}, {slot%2?'правая':'левая'} сторона · место {slot+1} из 10.</p>
      {pump?<>
        <p>Состояние: {pump.status==='building'?'строится':pump.status==='upgrading'?'модернизируется':'готова'}.
          Каналы: {pump.fuels.map(f=>station.fuels[f].name).join(', ')||'не подключены'}. Производительность ×{(pump.flowMultiplier??1).toFixed(1)}.</p>
        {serving&&<div className="pump-readout"><span>Фаза: {serving.servicePhase??'заправка'}</span><span>Литры: {litres(serving.deliveredMl,2)}</span><span>Стоимость: {rubles(serving.chargedKopeks)}</span>
          <span>Цена: {rubles(serving.salePriceKopeks)}/л</span></div>}
        {!serving&&<p>Последняя выдача: {litres(pump.lastDisplayMl??0,2)} · {rubles(pump.lastDisplayKopeks??0)}</p>}
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
      <p>Выберите поставщика и до трёх сортов. Для семи обычных поставщиков секция вмещает до 8000 л, рейс — до 24 000 л. НефтеОпт принимает от 5000 до 30 000 л за рейс. Цена закрепляется при заказе.</p>
      <div className="supplier-grid">{SUPPLIERS.map(s=>{const offer=state.market?marketOffer(state.market,s.id,chosenFuel,state.gameSeconds):undefined;const available=FUEL_IDS.filter(f=>state.market&&marketOffer(state.market,s.id,f,state.gameSeconds)!.availableLitres>0).map(f=>station.fuels[f].name);return <button type="button" key={s.id} className={supplierId===s.id?'selected':''} onClick={()=>setSupplierId(s.id)}><strong>{s.name}</strong><small>{s.profile}</small><span>{offer?.availableLitres.toLocaleString('ru-RU')??0} л · {rubles(offer?.priceKopeks??0)}/л</span><small>Доставка ~{Math.round((offer?.etaGameSeconds??0)/3600)} игровых ч</small><small>В наличии: {available.join(', ')||'ожидается поставка'}</small></button>;})}</div>
      <div className="order-steps"><span>Шаг изменения:</span>{[50,100,500,1000].map(step=><button type="button" key={step} className={orderStep===step?'active':''} onClick={()=>setOrderStep(step)}>{step} л</button>)}</div>
      {([[chosenFuel,deliveryLitres,setChosenFuel,setDeliveryLitres],[secondFuel,secondLitres,setSecondFuel,setSecondLitres],[thirdFuel,thirdLitres,setThirdFuel,setThirdLitres]] as const).map(([fuel,amount,setFuel,setAmount],index)=><div className="delivery-section" key={index}>
        <select value={fuel} onChange={e=>setFuel(e.target.value as FuelId & 'none')} aria-label={`Сорт секции ${index+1}`}>
          {index>0&&<option value="none">Без секции</option>}{FUEL_IDS.map(f=><option key={f} value={f}>{station.fuels[f].name}</option>)}
        </select>
        {fuel!=='none'&&<><div className="order-quantity"><button type="button" disabled={amount<=0} onClick={()=>setAmount(Math.max(0,amount-orderStep))} aria-label={`Уменьшить объём секции ${index+1}`}>−</button><strong>{amount.toLocaleString('ru-RU')} л</strong><button type="button" disabled={amount+orderStep>Math.min(bulk?NEFTEOPT.maxLitres:8000,Math.max(0,Math.floor(freeFor(fuel)/1000)-(requestedByFuel(fuel)-amount)),Math.max(0,(offerFor(fuel)?.availableLitres??0)-(requestedByFuel(fuel)-amount)),(bulk?NEFTEOPT.maxLitres:24000)-totalLitres+amount)} onClick={()=>setAmount(amount+orderStep)} aria-label={`Увеличить объём секции ${index+1}`}>+</button></div>
          <small>Поставщик: {offerFor(fuel)?.availableLitres??0} л · свободная ёмкость: {Math.max(0,Math.floor(freeFor(fuel)/1000))} л · {rubles(offerFor(fuel)?.priceKopeks??0)}/л</small></>}
      </div>)}
      {!station.tanks.some(t=>t.status==='active')&&<p>Перед заказом постройте резервуар нужного сорта.</p>}
      {orderProblem&&<p className="panel-error" role="status">{orderProblem}</p>}
      <p>Стоимость заказа: <strong>{rubles(orderCost)}</strong>{bulk&&<> · скидка <strong>{Math.round(discount*100)}%</strong> от базовой оптовой цены</>} · Доступный баланс: <strong>{rubles(station.balanceKopeks)}</strong></p>
      <button type="button" className="panel-action" disabled={!validCargo||submitting} onClick={()=>{if(submittingRef.current)return;submittingRef.current=true;setSubmitting(true);const ok=onDelivery(supplierId,cargoEntries.map(([fuel,amount])=>({fuel,litres:amount})));act(ok,'Поставка заказана.');if(!ok){submittingRef.current=false;setSubmitting(false);}}}>Заказать бензовоз · {rubles(orderCost)}</button>
      {state.deliveries?.map(d=><p key={d.id}>{d.id} · {SUPPLIERS.find(s=>s.id===d.supplierId)?.name??'Поставка'}: {{enroute:'в пути',waiting:'ожидает площадку',approaching:'подъезжает',connecting:'подключает рукав',unloading:'разгрузка',disconnecting:'отключает рукав',leaving:'выезжает'}[d.status??'enroute']} · осталось {litres(d.remainingMl??0,0)}</p>)}
    </>}
    {id==='expansion'&&<><p>Две строительные бригады. Новые ТРК приобретаются через пустые монтажные места под навесом; резервуары — через карточку люков.</p>
      {(station.jobs??[]).map(j=><p key={j.id}>{j.targetId}: {j.status==='active'?'в работе':'в очереди'} · {Math.ceil(j.remainingSeconds)} игровых с</p>)}</>}
    {id==='shop'&&<p>Магазин пока декоративный объект станции. Продажи магазина в экономике не учитываются.</p>}
    {notice&&<p role="status">{notice}</p>}{error&&<p className="panel-error" role="alert">{error}</p>}
    </div>
  </section>;
}
