import { toast } from './Toast';
import { useRef, useState } from 'react';
import { FUEL_IDS, MAX_FUELS_PER_PUMP } from '../game/domain/config';
import { TankManagement } from './TankManagement';
import { formatPriceDifference, priceDifference, priceDifferenceClass } from './priceComparison';
import pumpImage from '../assets/v027/pump-front-v072.webp';
import tankerImage from '../assets/v030-tanker-v072.webp';
import { nearestFuelDeliverySeconds } from '../game/domain/deliveryMotion';
import { marketOffer, nefteoptDiscount, NEFTEOPT, SUPPLIERS } from '../game/domain/market';
import type { FuelId, GameState, Vehicle } from '../game/domain/types';
import type { ObjectId } from './scene/createStationScene';
import { version as currentVersion } from '../../package.json';
import { condition, estimateRepair, resaleKopeks } from '../game/domain/technical';
import type { RepairTask } from '../game/domain/technical';
const litres=(ml:number,precision=3)=>(ml/1000).toLocaleString('ru-RU',{minimumFractionDigits:precision,maximumFractionDigits:precision})+' л';
const rubles=(kop:number)=>(kop/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽';
const repairStage=(task:RepairTask)=>task.blocked===false?'Ремонт назначен':task.phase==='working'?`Ремонт: ${Math.round((1-task.phaseRemaining/task.durationSeconds)*100)}%`:
  task.phase==='travel'?task.contractor?'Подрядчик в пути':'Техник в пути':'Ожидание освобождения';
interface Props {
  id:ObjectId;state:GameState;prices:Record<FuelId,number>;vehicles:readonly Vehicle[];
  onPrice:(fuel:FuelId,kopeks:number)=>void;onBuildPump:(slot:number)=>boolean;onUpgradePump:(id:string)=>boolean;
  onSetPumpEnabled:(id:string,enabled:boolean)=>boolean;
  onSetPumpFuels:(id:string,fuels:FuelId[])=>boolean;onBuildTank:(fuel:FuelId)=>boolean;onUpgradeTank:(id:string)=>boolean;
  onDelivery:(supplierId:string,sections:readonly {fuel:FuelId;litres:number}[])=>boolean;onClose:()=>void;onBack:()=>void;onCompetitors:()=>void;
  onTechnical:()=>void;onCommerce:()=>void;onSellPump:(id:string)=>boolean;onSellTank:(id:string)=>boolean;
}
export function ObjectPanel({id,state,prices,vehicles,onPrice,onBuildPump,onUpgradePump,onSetPumpEnabled,onSetPumpFuels,onBuildTank,onUpgradeTank,onDelivery,onClose,onBack,onCompetitors,onTechnical,onCommerce,onSellPump,onSellTank}:Props) {
  const station=state.station;
  const slot=id.startsWith('slot-')?Number(id.slice(5)):id.startsWith('pump-')?Number(id.slice(5))-1:-1;
  const pump=station.pumps.find(p=>p.slot===slot);

  const [chosenFuel,setChosenFuel]=useState<FuelId|'none'>('none');const [deliveryLitres,setDeliveryLitres]=useState(0);
  const [supplierId,setSupplierId]=useState('regional');
  const [secondFuel,setSecondFuel]=useState<FuelId|'none'>('none');const [secondLitres,setSecondLitres]=useState(0);
  const [thirdFuel,setThirdFuel]=useState<FuelId|'none'>('none');const [thirdLitres,setThirdLitres]=useState(0);
  const [orderStep,setOrderStep]=useState(100);
  const [submitting,setSubmitting]=useState(false);
  const submittingRef=useRef(false);
  const [channels,setChannels]=useState<FuelId[]>(()=>[...(pump?.fuels??[])]);
  const pumpSales=pump?(state.financeEvents??[]).filter(event=>event.kind==='sale'&&event.objectId===pump.id):[];
  const pumpVolume=pumpSales.reduce((sum,event)=>sum+(event.volumeMl??0),0);
  const pumpRevenue=pumpSales.reduce((sum,event)=>sum+event.amountKopeks,0);
  const today=Math.floor(state.gameSeconds/86400);
  const todayPumpSales=pumpSales.filter(event=>Math.floor(event.gameSeconds/86400)===today);
  const serving=pump?vehicles.find(v=>v.pumpId===pump.id&&(v.status==='fueling'||v.status==='finishing')):undefined;
  const pumpBusy=pump?vehicles.some(v=>v.pumpId===pump.id&&['entering','queued','toPump','fueling','finishing','leaving'].includes(v.status)):false;
  const activeFuels=FUEL_IDS.filter(f=>station.tanks.some(t=>t.fuel===f&&t.status==='active'&&condition(t)>0&&!state.technical?.tasks.some(job=>job.equipmentId===t.id&&job.blocked!==false)));
  const cargoEntries:[FuelId,number][]=[...(chosenFuel==='none'?[]:[[chosenFuel,deliveryLitres] as [FuelId,number]]),
    ...(secondFuel==='none'?[]:[[secondFuel,secondLitres] as [FuelId,number]]),
    ...(thirdFuel==='none'?[]:[[thirdFuel,thirdLitres] as [FuelId,number]])];
  const offerFor=(fuel:FuelId)=>{
    return state.market?marketOffer(state.market,supplierId,fuel,state.gameSeconds):undefined;
  };
  const totalLitres=cargoEntries.reduce((sum,[,amount])=>sum+amount,0),bulk=supplierId==='nefteopt';
  const discount=bulk?nefteoptDiscount(totalLitres):0;
  const orderCost=cargoEntries.reduce((sum,[fuel,amount])=>sum+amount*(bulk?Math.round((state.market?.baseKopeks[fuel]??0)*(1-discount)):(offerFor(fuel)?.priceKopeks??0)),0);
  const requestedByFuel=(fuel:FuelId)=>cargoEntries.filter(([id])=>id===fuel).reduce((sum,[,amount])=>sum+amount,0);
  const freeFor=(fuel:FuelId)=>station.tanks.filter(t=>t.fuel===fuel&&t.status==='active'&&condition(t)>0&&!state.technical?.tasks.some(job=>job.equipmentId===t.id&&job.blocked!==false)).reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-
    (state.deliveries??[]).reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
  const selectedOffer=cargoEntries[0]?offerFor(cargoEntries[0][0]):undefined;
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
  const act=(success:boolean,message:string)=>{if(success){toast(message,'success');}else toast('Действие недоступно. Проверьте баланс и доступность объекта.','error');};
  return <section className="full-screen" role="dialog" aria-label={name}>
    <header className="screen-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>{name}</h2><small>АЗС Simulator · v{currentVersion}</small></div><button type="button" onClick={onClose} aria-label="Вернуться к игре">×</button></header>
    <div className={`screen-content object-panel object-${id}`}>
    {id==='price-sign'&&<div className="price-screen-layout">
      <div className="price-sign-visual"><div className="sign-heading">АЗС</div>{FUEL_IDS.map(f=><div key={f}><span>{station.fuels[f].name}</span><strong>{(prices[f]/100).toFixed(2)}</strong></div>)}</div>
      <div className="price-cards"><p>Цены обновляются сразу. При отсутствии доступного топлива значение на сцене гаснет.</p>
      {FUEL_IDS.map(fuel=>{const market=state.market?.competitorKopeks[fuel];const difference=priceDifference(prices[fuel],market);return <article className="price-card" key={fuel}><div><strong>{station.fuels[fuel].name}</strong><small>{station.fuels[fuel].stockMl>0?'Доступно':'Нет топлива'}</small></div><div className="price-card-values"><strong>{rubles(prices[fuel])}</strong><span>Рынок: {market&&market>0?rubles(market):'—'} <b className={priceDifferenceClass(difference)}>{formatPriceDifference(difference)}</b></span></div><div className="price-card-actions"><button type="button" aria-label={`Уменьшить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]<=100} onClick={()=>onPrice(fuel,prices[fuel]-10)}>−</button><button type="button" aria-label={`Увеличить цену ${station.fuels[fuel].name}`} disabled={prices[fuel]>=99900} onClick={()=>onPrice(fuel,prices[fuel]+10)}>+</button><button type="button" disabled={!market||market<=0} onClick={()=>onPrice(fuel,Math.round(market!/10)*10)}>Рынок</button></div></article>})}
      <button type="button" className="panel-action" onClick={onCompetitors}>Цены конкурентов →</button></div>
    </div>}
    {slot>=0&&<>
      {pump&&<img className="pump-panel-art" src={pumpImage} alt="ТРК" />}
      {pump&&<div className="tech-object-summary"><p>Состояние: <strong>{condition(pump).toFixed(2)}%</strong> · запчасти {rubles(estimateRepair('pump',condition(pump)).partsKopeks)} · базовая работа {Math.ceil(estimateRepair('pump',condition(pump)).durationSeconds/60)} мин</p>
        <p>{pump.pendingAction==='disable'?'Выключится после текущей заправки':pump.pendingAction==='upgrade'?'Модернизация после текущей заправки':state.technical?.tasks.find(t=>t.equipmentId===pump.id)?`${repairStage(state.technical.tasks.find(t=>t.equipmentId===pump.id)!)} · ${state.technical.tasks.find(t=>t.equipmentId===pump.id)!.executorName}`:condition(pump)===0?'Остановлена':condition(pump)<20?'Нужно обслуживание':'Работает'}</p>
        <button type="button" className="panel-action" onClick={onTechnical}>Ремонт и назначения →</button>
        <button type="button" className="panel-action" disabled={pumpBusy||pump.status!=='ready'||!!state.technical?.tasks.find(t=>t.equipmentId===pump.id&&t.paid)} onClick={()=>{const amount=resaleKopeks(pump);if(window.confirm(`Продать ТРК за ${rubles(amount)}? Ожидающие автомобили могут уехать без заправки.`))act(onSellPump(pump.id),`ТРК продана за ${rubles(amount)}.`);}}>Продать ТРК · {rubles(resaleKopeks(pump))}</button></div>}
      <p>Опора {Math.floor(slot/2)+1}, {slot%2?'правая':'левая'} сторона · место {slot+1} из 10.</p>
      {pump?<>
        <p>Сегодня: {litres(todayPumpSales.reduce((sum,event)=>sum+(event.volumeMl??0),0),1)} · {rubles(todayPumpSales.reduce((sum,event)=>sum+event.amountKopeks,0))}. Всего по журналу: {litres(pumpVolume,1)} · {rubles(pumpRevenue)}.</p>
        <p>Состояние: {pump.status==='building'?'строится':pump.status==='upgrading'?'модернизируется':'готова'}.
          Каналы: {pump.fuels.map(f=>`${station.fuels[f].name} — ${station.tanks.filter(t=>t.fuel===f).map(t=>t.id).join(', ')||'нет резервуара'}`).join('; ')||'не подключены'}. Производительность ×{(pump.flowMultiplier??1).toFixed(1)}.</p>
        {serving&&<div className="pump-readout"><span>Фаза: {serving.status==='finishing'?'Завершение':serving.servicePhase==='preparing'?'Подготовка':'Заправка'}</span><span>Литры: {litres(serving.deliveredMl,2)}</span><span>Стоимость: {rubles(serving.chargedKopeks)}</span>
          <span>Цена: {rubles(serving.salePriceKopeks)}/л</span></div>}
        {!serving&&<p>{pump.lastDisplayMl&&pump.lastDisplayMl>0?`Последняя выдача: ${litres(pump.lastDisplayMl,2)} · ${rubles(pump.lastDisplayKopeks??0)}`:'Данных о последней выдаче нет'}</p>}
        <button type="button" className="panel-action" disabled={pump.status!=='ready'||!!pump.pendingAction}
          onClick={()=>act(onSetPumpEnabled(pump.id,pump.enabled===false),pump.enabled===false?'ТРК включена.':pumpBusy?'ТРК выключится после текущей заправки.':'ТРК выключена.')}>{pump.enabled===false?'Включить ТРК':'Выключить ТРК'}</button>
        <button type="button" className="panel-action" disabled={pump.status==='building'||pump.status==='upgrading'||!!pump.pendingAction||station.balanceKopeks<1_200_000} onClick={()=>act(onUpgradePump(pump.id),'Модернизация поставлена в очередь.')}>Модернизировать · 12 000 ₽</button>
        {(station.jobs??[]).filter(j=>j.kind==='rewire'&&j.targetId===pump.id).map(j=><p key={j.id}>Ожидает переподключения: {j.fuels?.map(f=>station.fuels[f].name).join(', ')}. Применится после текущего автомобиля.</p>)}<h3>Подключённые пистолеты</h3>
        <div className="fuel-choice">{activeFuels.map(f=><label key={f}><input type="checkbox" checked={channels.includes(f)} onChange={e=>setChannels(old=>e.target.checked?[...old,f].slice(0,MAX_FUELS_PER_PUMP):old.filter(x=>x!==f))}/>{station.fuels[f].name}</label>)}</div>
        <button type="button" className="panel-action" disabled={pump.status==='building'||pump.status==='upgrading'||(station.jobs??[]).some(j=>j.kind==='rewire'&&j.targetId===pump.id)} onClick={()=>act(onSetPumpFuels(pump.id,channels),'Переподключение займёт 3 игровые минуты.')}>Переподключить каналы</button>
      </>:<button type="button" className="panel-action" onClick={()=>act(onBuildPump(slot),'Строительство ТРК поставлено в очередь.')}>Построить ТРК · 25 000 ₽</button>}
      {(station.jobs??[]).filter(j=>j.targetId===pump?.id).map(j=><p key={j.id}>{j.status==='active'?'Бригада работает':'Ожидает бригаду'} · {Math.ceil(j.remainingSeconds)} игровых с</p>)}
    </>}
    {id==='tank'&&<TankManagement state={state} onBuild={onBuildTank} onUpgrade={onUpgradeTank} onSell={onSellTank} onTechnical={onTechnical} report={act} />}
    {id==='delivery'&&<>
      <p>Выберите поставщика и до трёх сортов. Для семи обычных поставщиков секция вмещает до 8000 л, рейс — до 24 000 л. НефтеОпт принимает от 5000 до 30 000 л за рейс. Цена закрепляется при заказе.</p>
      <h3>Поставщик</h3>
      <div className="supplier-grid">{SUPPLIERS.map(s=>{const offer=state.market?marketOffer(state.market,s.id,chosenFuel==='none'?'ai92':chosenFuel,state.gameSeconds):undefined;const available=FUEL_IDS.filter(f=>state.market&&marketOffer(state.market,s.id,f,state.gameSeconds)!.availableLitres>0).map(f=>station.fuels[f].name);return <button type="button" key={s.id} className={supplierId===s.id?'selected':''} onClick={()=>setSupplierId(s.id)}><img className="supplier-tanker" src={tankerImage} alt="" /><strong>{s.name}</strong><small>{s.profile}</small><span>{chosenFuel==='none'?s.id===supplierId?'Выбран':'Выбрать':`${offer?.availableLitres.toLocaleString('ru-RU')??0} л · ${rubles(offer?.priceKopeks??0)}/л`}</span><small>Доставка ~{Math.round((offer?.etaGameSeconds??0)/3600)} игровых ч</small><small>В наличии: {available.join(', ')||'ожидается поставка'}</small></button>;})}</div>
      <h3>Секции бензовоза</h3>
      <div className="order-steps"><span>Шаг изменения:</span>{[50,100,500,1000].map(step=><button type="button" key={step} className={orderStep===step?'active':''} onClick={()=>setOrderStep(step)}>{step} л</button>)}</div>
      <div className="delivery-sections">{([[chosenFuel,deliveryLitres,setChosenFuel,setDeliveryLitres],[secondFuel,secondLitres,setSecondFuel,setSecondLitres],[thirdFuel,thirdLitres,setThirdFuel,setThirdLitres]] as const).map(([fuel,amount,setFuel,setAmount],index)=><div className="delivery-section" key={index}>
        <label htmlFor={`delivery-fuel-${index}`}>Секция {index+1}</label><select id={`delivery-fuel-${index}`} value={fuel} onChange={e=>{setFuel(e.target.value as FuelId|'none');setAmount(0);}} aria-label={`Сорт секции ${index+1}`}>
          <option value="none">Без секции</option>{FUEL_IDS.map(f=><option key={f} value={f}>{station.fuels[f].name}</option>)}
        </select>
        {fuel!=='none'&&<><div className="order-quantity"><button type="button" disabled={amount<=0} onClick={()=>setAmount(Math.max(0,amount-orderStep))} aria-label={`Уменьшить объём секции ${index+1}`}>−</button><strong>{amount.toLocaleString('ru-RU')} л</strong><button type="button" disabled={amount+orderStep>Math.min(bulk?NEFTEOPT.maxLitres:8000,(bulk?NEFTEOPT.maxLitres:24000)-totalLitres+amount)} onClick={()=>setAmount(amount+orderStep)} aria-label={`Увеличить объём секции ${index+1}`}>+</button></div>
          <small>Поставщик: {offerFor(fuel)?.availableLitres??0} л · свободная ёмкость: {Math.max(0,Math.floor(freeFor(fuel)/1000))} л · {rubles(offerFor(fuel)?.priceKopeks??0)}/л</small></>}
      </div>)}</div>
      {!station.tanks.some(t=>t.status==='active')&&<p>Перед заказом постройте резервуар нужного сорта.</p>}

      <p>Стоимость заказа: <strong>{rubles(orderCost)}</strong>{bulk&&<> · скидка <strong>{Math.round(discount*100)}%</strong> от базовой оптовой цены</>} · Доступный баланс: <strong>{rubles(station.balanceKopeks)}</strong></p>
      {!!totalLitres&&selectedOffer&&<p>Прибытие через {Math.ceil(selectedOffer.etaGameSeconds/60)} игровых мин</p>}
      <button type="button" className="panel-action" disabled={!totalLitres||submitting} onClick={()=>{if(submittingRef.current)return;if(!validCargo){toast(orderProblem||'Заполните объёмы выбранных секций.','error');return;}submittingRef.current=true;setSubmitting(true);if(!window.confirm(`Заказать у ${SUPPLIERS.find(s=>s.id===supplierId)?.name} ${cargoEntries.map(([f,n])=>`${station.fuels[f].name} ${n} л`).join(', ')} за ${rubles(orderCost)}? Прибытие примерно через ${Math.round((offerFor(cargoEntries[0][0])?.etaGameSeconds??0)/60)} игровых минут.`)){submittingRef.current=false;setSubmitting(false);return;}const ok=onDelivery(supplierId,cargoEntries.map(([fuel,amount])=>({fuel,litres:amount})));if(ok){setChosenFuel('none');setSecondFuel('none');setThirdFuel('none');setDeliveryLitres(0);setSecondLitres(0);setThirdLitres(0);toast('Поставка заказана.','success');}else toast('Заказ не принят. Проверьте объём, цену и остатки.','error');submittingRef.current=false;setSubmitting(false);}}>Заказать бензовоз · {rubles(orderCost)}</button>
      <h3>Активные поставки</h3>
      <p>{nearestFuelDeliverySeconds(state.deliveries??[],state.gameSeconds)===null?'ПОСТАВОК НЕТ':`Бензовоз через ${Math.ceil(nearestFuelDeliverySeconds(state.deliveries??[],state.gameSeconds)!/60)} игровых мин`}{(state.deliveries??[]).some(d=>d.status==='unloading')?' · идёт разгрузка':''}</p>
      {state.deliveries?.map(d=><article className="delivery-card" key={d.id}><strong>Заказ №{d.id.split('-').at(-1)}</strong><span>{SUPPLIERS.find(s=>s.id===d.supplierId)?.name??'Поставка'}</span><span>{Object.entries(d.cargo).map(([f,ml])=>`${station.fuels[f as FuelId].name} ${litres(ml??0,0)}`).join(', ')}</span><span>{{enroute:'в пути',waiting:'ожидает площадку',approaching:'подъезжает',connecting:'подключает рукав',unloading:'разгрузка',disconnecting:'отключает рукав',leaving:'выезжает'}[d.status??'enroute']} · прибытие: день {Math.floor(d.arrivalGameSeconds/86400)+1}, {String(Math.floor(d.arrivalGameSeconds%86400/3600)).padStart(2,'0')}:{String(Math.floor(d.arrivalGameSeconds%3600/60)).padStart(2,'0')} · осталось {litres(d.remainingMl??0,0)}</span></article>)}    </>}
    {id==='expansion'&&<><p>Две строительные бригады. Новые ТРК приобретаются через пустые монтажные места под навесом; резервуары — через карточку люков.</p>
      {(station.jobs??[]).map(j=><p key={j.id}>{j.targetId}: {j.status==='active'?'в работе':'в очереди'} · {Math.ceil(j.remainingSeconds)} игровых с</p>)}</>}
    {id==='shop'&&<><p>Магазин и кафе работают независимо. Парковка: 10 легковых мест и отдельная стоянка для фур.</p><p>Магазин: {state.commerce?.venues.shop.level?'открыт':'не открыт'} · кафе: {state.commerce?.venues.cafe.level?'открыто':'не открыто'}.</p><button className="panel-action" onClick={onCommerce}>Магазин, кафе и закупки →</button></>}

    </div>
  </section>;
}
