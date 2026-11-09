import { FUEL_IDS } from '../game/domain/config';
import type { GameState } from '../game/domain/types';

const money=(kopeks:number)=>(kopeks/100).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
interface Props { state:GameState; onClose:()=>void }
export function OverviewPanel({state,onClose}:Props) {
  const {stats,recentSales,station}=state;
  return <div className="object-panel overview-panel" role="dialog" aria-label="Обзор АЗС">
    <div className="object-heading"><div><small>ЖИВАЯ СТАТИСТИКА</small><h2>Обзор АЗС</h2></div>
      <button type="button" onClick={onClose} aria-label="Закрыть обзор">×</button></div>
    <p>С начала этой игровой сессии. Поток трассы и заезды считаются отдельно.</p>
    <div className="overview-grid">
      <div><strong>{stats.passed}</strong><span>проехало мимо</span></div>
      <div><strong>{stats.visited}</strong><span>заехало</span></div>
      <div><strong>{stats.purchases}</strong><span>купило топливо</span></div>
      <div><strong>{stats.leftQueue}</strong><span>уехало из очереди</span></div>
      <div><strong>{stats.unserved}</strong><span>не обслужено</span></div>
      <div><strong>{Math.round(stats.soldMl/1000)} л</strong><span>продано</span></div>
    </div>
    <div className="overview-total"><span>Выручка</span><strong>{money(stats.revenueKopeks)}</strong></div>
    <div className="overview-total"><span>Условная себестоимость проданного топлива</span><strong>{money(stats.costKopeks)}</strong></div>
    <p>Закупки и операционные расходы появятся в следующих этапах; это ещё не полный отчёт о прибыли.</p>
    <h3>Остатки</h3>
    <div className="overview-fuels">{FUEL_IDS.map((id)=><span key={id}>{station.fuels[id].name}: {Math.round(station.fuels[id].stockMl/1000)} л</span>)}</div>
    <h3>Последние продажи</h3>
    {recentSales.length ? recentSales.map((sale)=><div className="overview-sale" key={sale.vehicleId}>
      <span>{station.fuels[sale.fuel].name} · {(sale.volumeMl/1000).toFixed(1)} л</span><strong>{money(sale.revenueKopeks)}</strong>
    </div>) : <p>Продаж пока нет.</p>}
  </div>;
}
