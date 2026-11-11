import type { GameState } from '../game/domain/types';

const money=(kopeks:number)=>(kopeks/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
interface Props { state:GameState; onClose:()=>void; onBack:()=>void }
export function OverviewPanel({state,onClose,onBack}:Props) {
  const {stats,recentSales,station,queueIds}=state;
  const expenses=state.expenses;
  const operating=(expenses?.lightingKopeks??0)+(expenses?.pumpElectricityKopeks??0)+(expenses?.tankMaintenanceKopeks??0)+(expenses?.pumpingKopeks??0);
  const inTransit=(state.deliveries??[]).reduce((sum,trip)=>sum+Object.entries(trip.remainingCargo??trip.cargo).reduce((cost,[fuel,ml])=>
    cost+Math.round((ml??0)*(trip.unitPrices?.[fuel as keyof typeof station.fuels]??station.fuels[fuel as keyof typeof station.fuels].wholesaleKopeks)/1000),0),0);
  return <section className="full-screen" role="dialog" aria-label="Обзор АЗС">
    <header className="screen-header"><button type="button" onClick={onBack}>← Меню</button><div><h2>Обзор АЗС</h2><small>Трафик, продажи и остатки</small></div><button type="button" onClick={onClose} aria-label="Закрыть обзор">×</button></header>
    <div className="screen-content overview-panel">
    <p>С начала игры или миграции сохранения. Поток трассы и заезды считаются отдельно.</p>
    <div className="overview-grid">
      <div><strong>{stats.passed}</strong><span>проехало мимо</span></div>
      <div><strong>{stats.visited}</strong><span>заехало</span></div>
      <div><strong>{stats.purchases}</strong><span>купило топливо</span></div>
      <div><strong>{stats.leftQueue}</strong><span>уехало из очереди</span></div>
      <div><strong>{queueIds.length}</strong><span>сейчас в очереди</span></div>
      <div><strong>{stats.unserved}</strong><span>не обслужено</span></div>
      <div><strong>{Math.round(stats.soldMl/1000)} л</strong><span>продано</span></div>
    </div>
    <div className="overview-total"><span>Выручка</span><strong>{money(stats.revenueKopeks)}</strong></div>
    <div className="overview-total"><span>Себестоимость проданного топлива</span><strong>{money(stats.costKopeks)}</strong></div>
    <div className="overview-total"><span>Валовая прибыль</span><strong>{money(stats.revenueKopeks-stats.costKopeks)}</strong></div>
    <h3>Расходы и денежный поток</h3>
    <div className="overview-total"><span>Освещение</span><strong>{money(expenses?.lightingKopeks??0)}</strong></div>
    <div className="overview-total"><span>Электричество ТРК</span><strong>{money(expenses?.pumpElectricityKopeks??0)}</strong></div>
    <div className="overview-total"><span>Обслуживание резервуаров</span><strong>{money(expenses?.tankMaintenanceKopeks??0)}</strong></div>
    <div className="overview-total"><span>Прокачка топлива</span><strong>{money(expenses?.pumpingKopeks??0)}</strong></div>
    <div className="overview-total"><span>Операционные расходы</span><strong>{money(operating)}</strong></div>
    <div className="overview-total"><span>Результат после базовых расходов</span><strong>{money(stats.revenueKopeks-stats.costKopeks-operating)}</strong></div>
    <div className="overview-total"><span>Закупки топлива (оплачено)</span><strong>{money(expenses?.purchasesKopeks??0)}</strong></div>
    <div className="overview-total"><span>Оплаченное топливо в пути</span><strong>{money(inTransit)}</strong></div>
    <div className="overview-total"><span>Стоимость топлива в резервуарах</span><strong>{money(Object.values(expenses?.stockValueKopeks??{}).reduce((sum,value)=>sum+value,0))}</strong></div>
    <div className="overview-total"><span>Строительство и модернизация</span><strong>{money(expenses?.capitalKopeks??0)}</strong></div>
    <p>Себестоимость рассчитывается по средней стоимости запаса каждого сорта. Результат не включает налоги, зарплаты и амортизацию. Старые закупки и стройка до миграции не восстанавливаются задним числом.</p>
    <h3>Остатки</h3>
    <div className="overview-fuels">{station.tanks.map((tank)=><span key={tank.id}>{station.fuels[tank.fuel].name}: {Math.round(tank.stockMl/1000)} из {tank.capacityMl/1000} л</span>)}</div>
    <h3>Последние продажи</h3>
    {recentSales.length ? recentSales.map((sale)=><div className="overview-sale" key={sale.vehicleId}>
      <span>{station.fuels[sale.fuel].name} · {(sale.volumeMl/1000).toFixed(1)} л</span><strong>{money(sale.revenueKopeks)}</strong>
    </div>) : <p>Продаж пока нет.</p>}
    </div>
  </section>;
}
