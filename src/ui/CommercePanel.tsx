import { priceDifference, formatPriceDifference, priceDifferenceClass } from './priceComparison';
import { toast } from './Toast';
import { PARKING_SLOTS } from '../game/domain/roadNetwork';
import {useRef,useState} from 'react';
import commerceArt from '../assets/commerce-interior-v072.webp';
import {SKU,PRODUCTS,RECIPES,VENUES,STAFF_SPEED,TRAIN_COST,SUPPLIERS,buyPrice,retailMarketPrice,usedSpace} from '../game/domain/commerce';
import type {Venue,Sku,Product,Supplier} from '../game/domain/commerce';
import type {GameState} from '../game/domain/types';
import type {GameEngine} from '../game/simulation/GameEngine';
import {ProductArt} from './ProductArt';

const money=(n:number)=>(n/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const quantity=(sku:Sku,n:number)=>sku==='coffee'?(n/1000).toLocaleString('ru-RU',{maximumFractionDigits:2})+' кг':sku==='milk'?(n/1000).toLocaleString('ru-RU',{maximumFractionDigits:2})+' л':n.toLocaleString('ru-RU')+' шт.';
type View='overview'|'orders'|'prices'|'analytics';

export function CommercePanel({state,engine,venue,refresh,onClose,onBack,onVenue}:{state:GameState;engine:GameEngine;venue:Venue;refresh:()=>void;onClose:()=>void;onBack:()=>void;onVenue:(venue:Venue)=>void}){
  const [view,setView]=useState<View>('overview');
  const [supplier,setSupplier]=useState<Supplier>('standard');
  const [cart,setCart]=useState<Partial<Record<Sku,number>>>({});
  const [step,setStep]=useState(10);
  const [period,setPeriod]=useState(0);
  const ordering=useRef(false);
  const commerce=state.commerce!;
  const v=commerce.venues[venue],config=VENUES[venue];
  const skus=(Object.keys(SKU) as Sku[]).filter(sku=>SKU[sku].venue===venue);
  const products=(Object.keys(PRODUCTS) as Product[]).filter(product=>PRODUCTS[product].venue===venue&&PRODUCTS[product].retail>0);
  const day=Math.floor(state.gameSeconds/86400);
  const daySales=(state.financeEvents??[]).filter(event=>event.kind==='goodsSale'&&event.objectId===venue&&Math.floor(event.gameSeconds/86400)===day);
  const sold=(sku:Sku)=>daySales.reduce((sum,event)=>{
    if(!event.productId)return sum;
    const product=event.productId as Product;
    const recipe=RECIPES[product as keyof typeof RECIPES]??{[product]:1};
    return sum+(recipe[sku]??0);
  },0);
  const productBreakdownComplete=daySales.every(event=>!!event.productId);
  const dailyRevenue=daySales.reduce((sum,event)=>sum+event.amountKopeks,0);
  const dailyCost=daySales.reduce((sum,event)=>sum+(event.costKopeks??0),0);
  const markup=dailyCost>0?Math.round((dailyRevenue-dailyCost)/dailyCost*100):null;
  const cartLines=(Object.entries(cart) as [Sku,number][]).filter(([sku,n])=>SKU[sku]?.venue===venue&&n>0);
  const total=cartLines.reduce((sum,[sku,n])=>sum+buyPrice(sku,state.gameSeconds,supplier)*n,0);
  const requested=cartLines.reduce((sum,[sku,n])=>sum+SKU[sku].size*n,0);
  const free=config.capacity[v.level]-usedSpace(commerce,venue);
  const problem=!v.level?'Сначала откройте заведение.':requested>free+.001?'Недостаточно места на складе с учётом поставок в пути.':total>state.station.balanceKopeks?'Недостаточно денег.':'';
  const range=[86400,604800,2592000,Infinity][period];
  const events=(state.financeEvents??[]).filter(event=>event.objectId===venue&&(range===Infinity||event.gameSeconds>=state.gameSeconds-range));
  const sum=(kind:string)=>events.filter(event=>event.kind===kind).reduce((n,event)=>n+event.amountKopeks,0);
  const sales=events.filter(event=>event.kind==='goodsSale');
  const revenue=sum('goodsSale'),cost=sales.reduce((n,event)=>n+(event.costKopeks??0),0);
  const fail=(ok:boolean,success:string)=>{toast(ok?success:'Действие недоступно. Проверьте баланс и условия.',ok?'success':'error');refresh();};
  const changePrice=(product:Product,price:number)=>{if(!engine.setGoodsPrice(product,price))toast('Цена не изменена. Проверьте допустимое значение.','error');refresh();};
  const order=()=>{
    if(ordering.current||!cartLines.length)return;
    if(problem){toast(problem,'error');return;}
    if(!window.confirm(`Заказать товары для «${config.name}» у поставщика «${SUPPLIERS[supplier].name}» за ${money(total)}?`))return;
    ordering.current=true;
    const ok=engine.orderGoods(supplier,Object.fromEntries(cartLines));
    fail(ok,`Товары для «${config.name}» заказаны.`);
    if(ok)setCart({});
    queueMicrotask(()=>{ordering.current=false;});
  };
  const orders=commerce.orders.filter(item=>Object.keys(item.lines).some(sku=>SKU[sku as Sku]?.venue===venue));
  const venueRevenue=v.revenueKopeks;
  return <section className={`full-screen venue-screen venue-${venue}`} role="dialog" aria-label={config.name}>
    <header className="screen-header venue-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>{venue==='shop'?'🛒':'☕'} {config.name}</h2><small>Автоматическое обслуживание клиентов</small></div><div className="venue-switch"><button type="button" className={venue==='shop'?'active':''} onClick={()=>onVenue('shop')}>Магазин</button><button type="button" className={venue==='cafe'?'active':''} onClick={()=>onVenue('cafe')}>Кафе</button></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
    <div className="screen-content venue-content">
      <div className="venue-topline"><div className="venue-banner" style={{backgroundImage:`linear-gradient(90deg,#051923f5 0%,#051923c7 47%,#0519232c 100%),url(${commerceArt})`}}><span>{venue==='shop'?'АЗС · МАРКЕТ':'АЗС · КАФЕ'}</span><strong>{config.name}</strong><small>{v.level?`Уровень ${v.level}/3 · сотрудник ${v.staffLevel}/5`:'Ожидает открытия'}</small></div><div className="venue-facts"><span className={v.level?'live':'closed'}>{v.level?'● Работает самостоятельно':'○ Закрыто'}</span><span>Обслуживание: {v.level?Math.ceil(config.service*STAFF_SPEED[Math.max(0,v.staffLevel-1)]/60)+' мин':'—'}</span><span>Парковка: {commerce.parking.filter(id=>id!==null).length}/{PARKING_SLOTS.length} занято</span></div></div>
      <nav className="venue-tabs" aria-label={`Разделы: ${config.name}`}><button className={view==='overview'?'active':''} onClick={()=>setView('overview')}>Обзор</button><button className={view==='orders'?'active':''} onClick={()=>setView('orders')}>Закупки</button><button className={view==='prices'?'active':''} onClick={()=>setView('prices')}>Цены</button><button className={view==='analytics'?'active':''} onClick={()=>setView('analytics')}>Финансы</button></nav>
      {view==='overview'&&<>
        <div className="venue-products">{skus.map(sku=><article className="venue-product" key={sku}><ProductArt sku={sku}/><div className="venue-product-copy"><h3>{SKU[sku].name}</h3><p>Запасы: <strong>{quantity(sku,commerce.stock[sku].quantity)}</strong></p><p>Продажи сегодня: <strong>{productBreakdownComplete?quantity(sku,sold(sku)):'—'}</strong></p></div><button onClick={()=>setView('orders')}>Управление запасами →</button></article>)}</div>{!productBreakdownComplete&&<p>В старых операциях не сохранён товар; их нельзя достоверно распределить по карточкам.</p>}
        <div className="venue-summary"><div>Продажи сегодня <strong>{daySales.length.toLocaleString('ru-RU')} шт.</strong></div><div>Выручка сегодня <strong>{money(dailyRevenue)}</strong></div><div>Торговая наценка по продажам <strong>{markup===null?'Нет продаж':markup+'%'}</strong></div><button onClick={()=>setView('orders')}>Закупки →</button></div>
        <div className="venue-management"><div><h3>Здание и персонал</h3><p>Очередь: {v.queue.length} · склад: {usedSpace(commerce,venue,false).toFixed(1)} / {config.capacity[v.level]} мест · выручка за всё время: {money(venueRevenue)}</p></div>{!v.level?<button className="panel-action" onClick={()=>{if(window.confirm(`Открыть ${config.name.toLowerCase()} за ${money(config.open)}?`))fail(engine.openVenue(venue),`${config.name} открыто.`);}}>Открыть · {money(config.open)}</button>:<><button className="panel-action" disabled={v.level>=3} onClick={()=>{if(window.confirm(`Улучшить ${config.name.toLowerCase()} за ${money(config.upgrades[v.level])}?`))fail(engine.upgradeVenue(venue),`${config.name} улучшено.`);}}>Улучшить · {v.level<3?money(config.upgrades[v.level]):'Максимум'}</button><button className="panel-action" disabled={v.staffLevel>=5} onClick={()=>{if(window.confirm(`Обучить сотрудника за ${money(TRAIN_COST[v.staffLevel])}?`))fail(engine.trainVenue(venue),`Сотрудник заведения «${config.name}» прошёл обучение.`);}}>Обучить · {v.staffLevel<5?money(TRAIN_COST[v.staffLevel]):'Максимум'}</button></>}</div>
      </>}
      {view==='orders'&&<><div className="venue-order-head"><h3>Заказ товаров · {config.name}</h3><span>Склад: {usedSpace(commerce,venue,false).toFixed(1)} / {config.capacity[v.level]} мест · свободно с учётом заказов: {Math.max(0,free).toFixed(1)}</span></div><div className="venue-suppliers">{(Object.keys(SUPPLIERS) as Supplier[]).map(id=><button key={id} className={supplier===id?'selected':''} onClick={()=>setSupplier(id)}><strong>{SUPPLIERS[id].name}</strong><small>Цена ×{SUPPLIERS[id].price} · {Math.round(SUPPLIERS[id].eta/60)} игровых мин</small></button>)}</div><div className="order-steps">Шаг: {[1,10,50,100].map(n=><button key={n} className={step===n?'active':''} onClick={()=>setStep(n)}>{n}</button>)}</div><div className="venue-order-list">{skus.map(sku=>{const unit=sku==='coffee'||sku==='milk'?100:1;return <div key={sku}><ProductArt sku={sku}/><span>{SKU[sku].name}<small>{money(buyPrice(sku,state.gameSeconds,supplier)*unit)}/{unit===100?'100 г/мл':SKU[sku].unit}</small></span><button onClick={()=>setCart(old=>({...old,[sku]:Math.max(0,(old[sku]??0)-step*unit)}))}>−</button><strong>{quantity(sku,cart[sku]??0)}</strong><button onClick={()=>setCart(old=>({...old,[sku]:(old[sku]??0)+step*unit}))}>+</button></div>;})}</div><div className="venue-checkout"><span>Сумма: <strong>{money(total)}</strong></span><span>Прибытие через {Math.round(SUPPLIERS[supplier].eta/60)} игровых мин</span><button className="panel-action" disabled={!total} onClick={order}>Оформить заказ</button></div><h3>Поставки {config.name.toLowerCase()}</h3>{orders.length?orders.slice().reverse().map(item=><div className="venue-order-history" key={item.id}><strong>№{item.id.split('-')[1]}</strong><span>{SUPPLIERS[item.supplier].name} · {money(Object.entries(item.lines).filter(([sku])=>SKU[sku as Sku]?.venue===venue).reduce((n,[,line])=>n+(line?.costKopeks??0),0))}</span><span>{item.status==='enroute'?`В пути · ${Math.max(0,Math.ceil((item.arrival-state.gameSeconds)/60))} мин`:({waiting:'Ожидает площадку',approaching:'Подъезжает',unloading:'Разгружается',leaving:'Разгружен, выезжает',delivered:'Доставлен',cancelled:'Отменён'}[item.status])}</span></div>):<p>Заказов пока нет.</p>}</>}
      {view==='prices'&&<><h3>Розничные цены</h3><p>Изменение цены влияет на вероятность покупки; цена каждой позиции сохраняется.</p><div className="venue-price-list">{products.map(product=><div key={product}><span>{PRODUCTS[product].name}<small>Рынок: {retailMarketPrice(product,state.gameSeconds)>0?money(retailMarketPrice(product,state.gameSeconds)):'Нет данных'} · <b className={priceDifferenceClass(priceDifference(commerce.prices[product],retailMarketPrice(product,state.gameSeconds)))}>{formatPriceDifference(priceDifference(commerce.prices[product],retailMarketPrice(product,state.gameSeconds)))}</b></small></span><button onClick={()=>changePrice(product,Math.max(100,commerce.prices[product]-100))}>−</button><strong>{money(commerce.prices[product])}</strong><button onClick={()=>changePrice(product,commerce.prices[product]+100)}>+</button><button onClick={()=>changePrice(product,retailMarketPrice(product,state.gameSeconds))}>Рынок</button></div>)}</div></>}
      {view==='analytics'&&<><div className="periods">{['День','Неделя','Месяц','Всё время'].map((name,i)=><button key={i} className={period===i?'active':''} onClick={()=>setPeriod(i)}>{name}</button>)}</div><div className="venue-finance-grid"><div>Выручка <strong>{money(revenue)}</strong></div><div>Себестоимость <strong>{money(cost)}</strong></div><div>Валовая прибыль <strong>{money(revenue-cost)}</strong></div><div>Зарплата <strong>{money(sum('goodsSalary'))}</strong></div><div>Содержание <strong>{money(sum('goodsMaintenance'))}</strong></div><div>Результат <strong>{money(revenue-cost-sum('goodsSalary')-sum('goodsMaintenance'))}</strong></div></div><p>Заказы оплачиваются при оформлении. Отказы за всё время: {v.lost}.</p></>}

    </div>
  </section>;
}
