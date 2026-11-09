import { useState } from 'react';
import { FUEL_IDS, INITIAL_STATION } from '../game/domain/config';
import type { FuelId, StationState, Vehicle } from '../game/domain/types';
import type { ObjectId } from './scene/createStationScene';

const names: Record<ObjectId,string> = {
  'price-sign':'Стела с ценами','pump-1':'Колонка №1','pump-2':'Колонка №2',
  tank:'Резервуары',shop:'Магазин',delivery:'Зона разгрузки',expansion:'Площадка расширения',
};
interface Props {
  id: ObjectId;
  prices: Record<FuelId, number>;
  pumpFuels: Record<'pump-1'|'pump-2', FuelId[]>;
  station: StationState;
  vehicles: readonly Vehicle[];
  onPrice: (fuel: FuelId, kopeks: number) => void;
  onPump: (id: 'pump-1'|'pump-2', fuels: FuelId[]) => boolean;
  onClose: () => void;
}
export function ObjectPanel({ id, prices, pumpFuels, station, vehicles, onPrice, onPump, onClose }: Props) {
  const [error, setError] = useState('');
  const isPump = id === 'pump-1' || id === 'pump-2';
  const toggleFuel = (fuel: FuelId) => {
    if (!isPump) return;
    const current = pumpFuels[id];
    const next = current.includes(fuel) ? current.filter((item) => item !== fuel) : [...current, fuel];
    if (!next.length || next.length > 3) { setError('Выберите от 1 до 3 видов топлива.'); return; }
    if (!onPump(id,next)) {setError('Колонка занята: дождитесь окончания обслуживания.'); return;}
    setError('');
  };
  return <div className="object-panel" role="dialog" aria-label={names[id]}>
    <div className="object-heading"><div><small>v0.2-B · ЖИВАЯ СИМУЛЯЦИЯ</small><h2>{names[id]}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть карточку">×</button></div>
    {id === 'price-sign' && <>
      <p>Розничные цены влияют на сумму продажи. Влияние цены на спрос появится в v0.4.</p>
      {FUEL_IDS.map((fuel) => <label className="price-row" key={fuel}>
        <span>{INITIAL_STATION.fuels[fuel].name}</span>
        <input type="number" min="1" max="999" step=".01" defaultValue={(prices[fuel]/100).toFixed(2)}
          onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 999) { onPrice(fuel, Math.round(value*100)); event.target.value=value.toFixed(2); setError(''); } else { event.target.value=(prices[fuel]/100).toFixed(2); setError('Цена должна быть от 1 до 999 ₽/л.'); } }} />
        <span>₽/л</span><small>ориентир {(INITIAL_STATION.fuels[fuel].retailKopeks/100).toFixed(2)} ₽</small>
      </label>)}
      {error && <p className="panel-error">{error}</p>}
    </>}
    {isPump && <>
      <p>{vehicles.some((vehicle)=>vehicle.pumpId===id&&(vehicle.status==='toPump'||vehicle.status==='fueling'))?'Состояние: занята':'Состояние: готова'} · выберите до трёх сортов. Изменение во время обслуживания недоступно.</p>
      <div className="fuel-choice">{FUEL_IDS.map((fuel) => <label key={fuel}><input type="checkbox" checked={pumpFuels[id].includes(fuel)} onChange={() => toggleFuel(fuel)} />{INITIAL_STATION.fuels[fuel].name}</label>)}</div>
      {error && <p className="panel-error">{error}</p>}
      <p>Закрытие и ремонт появятся позже. Машины заправляются только совместимым сортом.</p>
    </>}
    {id === 'tank' && <>
      <p>Текущие остатки. Во время заправки топливо списывается по мере выдачи.</p>
      {FUEL_IDS.map((fuel) => { const stock=station.fuels[fuel]; return <div className="tank-row" key={fuel}>
        <strong>{stock.name}</strong><span>{stock.stockMl/1000} л</span><span>из {stock.capacityMl/1000} л</span><small>свободно {(stock.capacityMl-stock.stockMl)/1000} л · исправен</small>
      </div>; })}
    </>}
    {id === 'shop' && <p>Управление магазином будет доступно в v0.7.</p>}
    {id === 'delivery' && <p>Поставки и разгрузка будут доступны в v0.3. Сейчас площадка свободна.</p>}
    {id === 'expansion' && <p>Строительство будет доступно в v0.5. Площадка зарезервирована для расширения.</p>}
  </div>;
}
