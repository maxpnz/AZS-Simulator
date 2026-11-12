import { modelById } from '../game/domain/vehicleModels';
import type { FuelId, Vehicle } from '../game/domain/types';
const behavior={full:'До полного бака',amount:'На фиксированную сумму',volume:'Фиксированный объём'};
const status={road:'На дороге',entering:'Въезжает',queued:'Ожидает ТРК',toPump:'Подъезжает к ТРК',fueling:'Обслуживание',finishing:'Посадка водителя',leaving:'Выезжает'};
const phase={exiting:'Водитель выходит',toBuilding:'Идёт к зданию',paying:'Оплачивает',returning:'Возвращается',preparing:'Готовит пистолет',dispensing:'Заправляет',boarding:'Садится в автомобиль'};
export function VehiclePanel({vehicle,fuelName,prices,onClose}:{vehicle:Vehicle;fuelName:Record<FuelId,string>;prices:Record<FuelId,number>;onClose:()=>void}){
  const model=modelById(vehicle.modelId);
  const current=vehicle.currentFuelMl+vehicle.deliveredMl;
  const requested=vehicle.reservedMl||Math.min(vehicle.tankCapacityMl-vehicle.currentFuelMl,vehicle.behavior==='amount'?Math.floor(vehicle.budgetKopeks*1000/(vehicle.salePriceKopeks||prices[vehicle.fuel])):vehicle.requestedMl);
  return <aside className="vehicle-panel" role="dialog" aria-label={`Автомобиль ${vehicle.id}`}>
    <header><h2>{model.id} <small>№{vehicle.id}</small></h2><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
    <p>{vehicle.category} · {fuelName[vehicle.fuel]}</p>
    <dl><div><dt>Бак</dt><dd>{(vehicle.tankCapacityMl/1000).toFixed(0)} л</dd></div><div><dt>Остаток</dt><dd>{(current/1000).toFixed(1)} л · {Math.round(100*current/vehicle.tankCapacityMl)}%</dd></div>
      <div><dt>Покупка</dt><dd>{behavior[vehicle.behavior]}</dd></div><div><dt>Запрос</dt><dd>{(requested/1000).toFixed(1)} л</dd></div>
      <div><dt>Состояние</dt><dd>{vehicle.servicePhase&&['fueling','finishing'].includes(vehicle.status)?phase[vehicle.servicePhase]:status[vehicle.status]}</dd></div>
      {vehicle.pumpId&&<div><dt>ТРК</dt><dd>№{Number(vehicle.pumpId.split('-')[1])}</dd></div>}
      {vehicle.refusalReason&&<div><dt>Причина отказа</dt><dd>{vehicle.refusalReason}</dd></div>}
    </dl>
  </aside>;
}
