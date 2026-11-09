import { useState } from 'react';
import { FUEL_IDS, INITIAL_STATION } from '../game/domain/config';
import type { FuelId } from '../game/domain/types';
import type { ObjectId } from './scene/createStationScene';

const names: Record<ObjectId,string> = {
  'price-sign':'Стела с ценами','pump-1':'Колонка №1','pump-2':'Колонка №2',
  tank:'Резервуары',shop:'Магазин',delivery:'Зона разгрузки',expansion:'Площадка расширения',
};
interface Props {
  id: ObjectId;
  prices: Record<FuelId, number>;
  pumpFuels: Record<'pump-1'|'pump-2', FuelId[]>;
  onPrice: (fuel: FuelId, kopeks: number) => void;
  onPump: (id: 'pump-1'|'pump-2', fuels: FuelId[]) => void;
  onClose: () => void;
}
export function ObjectPanel({ id, prices, pumpFuels, onPrice, onPump, onClose }: Props) {
  const [error, setError] = useState('');
  const isPump = id === 'pump-1' || id === 'pump-2';
  const toggleFuel = (fuel: FuelId) => {
    if (!isPump) return;
    const current = pumpFuels[id];
    const next = current.includes(fuel) ? current.filter((item) => item !== fuel) : [...current, fuel];
    if (!next.length || next.length > 3) { setError('Выберите от 1 до 3 видов топлива.'); return; }
    setError(''); onPump(id,next);
  };
  return <div className="object-panel" role="dialog" aria-label={names[id]}>
    <div className="object-heading"><div><small>ДЕМО · v0.2-A</small><h2>{names[id]}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть карточку">×</button></div>
    {id === 'price-sign' && <>
      <p>Редактор демонстрационных розничных цен. Изменения видны здесь и не запускают продажи.</p>
      {FUEL_IDS.map((fuel) => <label className="price-row" key={fuel}>
        <span>{INITIAL_STATION.fuels[fuel].name}</span>
        <input type="number" min="1" max="999" step=".01" defaultValue={(prices[fuel]/100).toFixed(2)}
          onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 999) { onPrice(fuel, Math.round(value*100)); event.target.value=value.toFixed(2); setError(''); } else { event.target.value=(prices[fuel]/100).toFixed(2); setError('Цена должна быть от 1 до 999 ₽/л.'); } }} />
        <span>₽/л</span><small>ориентир {(INITIAL_STATION.fuels[fuel].retailKopeks/100).toFixed(2)} ₽</small>
      </label>)}
      {error && <p className="panel-error">{error}</p>}
    </>}
    {isPump && <>
      <p>Состояние: готова · демонстрационная конфигурация. Выберите до трёх сортов.</p>
      <div className="fuel-choice">{FUEL_IDS.map((fuel) => <label key={fuel}><input type="checkbox" checked={pumpFuels[id].includes(fuel)} onChange={() => toggleFuel(fuel)} />{INITIAL_STATION.fuels[fuel].name}</label>)}</div>
      {error && <p className="panel-error">{error}</p>}
      <p>Закрытие, ремонт и фактическая заправка появятся позже.</p>
    </>}
    {id === 'tank' && <>
      <p>Начальные данные из конфигурации станции. Остатки пока не меняются.</p>
      {FUEL_IDS.map((fuel) => { const stock=INITIAL_STATION.fuels[fuel]; return <div className="tank-row" key={fuel}>
        <strong>{stock.name}</strong><span>{stock.litres} л</span><span>из {stock.capacityLitres} л</span><small>свободно {(stock.capacityLitres-stock.litres)} л · исправен</small>
      </div>; })}
    </>}
    {id === 'shop' && <p>Управление магазином будет доступно в v0.7.</p>}
    {id === 'delivery' && <p>Поставки и разгрузка будут доступны в v0.3. Сейчас площадка свободна.</p>}
    {id === 'expansion' && <p>Строительство будет доступно в v0.5. Площадка зарезервирована для расширения.</p>}
  </div>;
}
