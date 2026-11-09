import { useState } from 'react';
import { INITIAL_STATION } from '../game/domain/config';
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
  onClose: () => void;
}
export function ObjectPanel({ id, prices, pumpFuels, station, vehicles, onPrice, onClose }: Props) {
  const [error, setError] = useState('');
  const isPump = id === 'pump-1' || id === 'pump-2';
  const activeFuels=station.tanks.map((tank)=>tank.fuel);
  const serving=isPump?vehicles.find((vehicle)=>vehicle.pumpId===id&&vehicle.status==='fueling'):undefined;
  return <div className="object-panel" role="dialog" aria-label={names[id]}>
    <div className="object-heading"><div><small>v0.2.3 · ЖИВАЯ СИМУЛЯЦИЯ</small><h2>{names[id]}</h2></div><button type="button" onClick={onClose} aria-label="Закрыть карточку">×</button></div>
    {id === 'price-sign' && <>
      <p>Розничные цены влияют на сумму продажи. Влияние цены на спрос появится в v0.4.</p>
      {activeFuels.map((fuel) => <label className="price-row" key={fuel}>
        <span>{INITIAL_STATION.fuels[fuel].name}</span>
        <input type="number" min="1" max="999" step=".01" defaultValue={(prices[fuel]/100).toFixed(2)}
          onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 1 && value <= 999) { onPrice(fuel, Math.round(value*100)); event.target.value=value.toFixed(2); setError(''); } else { event.target.value=(prices[fuel]/100).toFixed(2); setError('Цена должна быть от 1 до 999 ₽/л.'); } }} />
        <span>₽/л</span><small>ориентир {(INITIAL_STATION.fuels[fuel].retailKopeks/100).toFixed(2)} ₽</small>
      </label>)}
      {error && <p className="panel-error">{error}</p>}
    </>}
    {isPump && <>
      <p>{serving?'Состояние: заправка':'Состояние: готова'}. Подключены: {pumpFuels[id].map((fuel)=>station.fuels[fuel].name).join(', ')}.</p>
      {serving&&<p>Выдано {(serving.deliveredMl/1000).toFixed(1)} из {(serving.reservedMl/1000).toFixed(1)} л · начислено {(serving.chargedKopeks/100).toFixed(2)} ₽.</p>}
      <p>Переподключение каналов с затратой игрового времени появится в v0.3. Закрытие и ремонт — позже.</p>
    </>}
    {id === 'tank' && <>
      <p>Текущие остатки. Во время заправки топливо списывается по мере выдачи.</p>
      {station.tanks.map((tank) => { const stock=station.fuels[tank.fuel]; return <div className="tank-row" key={tank.id}>
        <strong>{stock.name}</strong><span>{tank.stockMl/1000} л</span><span>из {tank.capacityMl/1000} л</span><small>№ {tank.id} · свободно {(tank.capacityMl-tank.stockMl)/1000} л · исправен</small>
      </div>; })}
    </>}
    {id === 'shop' && <p>Управление магазином будет доступно в v0.7.</p>}
    {id === 'delivery' && <p>Поставки и разгрузка будут доступны в v0.3. Сейчас площадка свободна.</p>}
    {id === 'expansion' && <p>Строительство будет доступно в v0.5. Площадка зарезервирована для расширения.</p>}
  </div>;
}
