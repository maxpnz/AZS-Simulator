import type { CommerceState } from '../game/domain/commerce';
import { modelById } from '../game/domain/vehicleModels';
import type { FuelId, Vehicle } from '../game/domain/types';
const behavior={full:'До полного бака',amount:'На фиксированную сумму',volume:'Фиксированный объём'};
const status={road:'На дороге',entering:'К месту у ТРК',queued:'Ожидает ТРК',toPump:'Подъезжает к ТРК',fueling:'Обслуживание',finishing:'Завершает обслуживание',leaving:'Выезжает',toParking:'Едет на парковку',parked:'На парковке'};
const phase={preparing:'Подготовка',dispensing:'Заправляет'};
export function VehiclePanel({vehicle,fuelName,prices,onClose,customer}:{vehicle:Vehicle;fuelName:Record<FuelId,string>;prices:Record<FuelId,number>;onClose:()=>void;customer?:CommerceState['customers'][number]}){
  const model=modelById(vehicle.modelId);
  const current=vehicle.currentFuelMl+vehicle.deliveredMl;
  const requested=vehicle.reservedMl||Math.min(vehicle.tankCapacityMl-vehicle.currentFuelMl,vehicle.behavior==='amount'?Math.floor(vehicle.budgetKopeks*1000/(vehicle.salePriceKopeks||prices[vehicle.fuel])):vehicle.requestedMl);
  return <aside className="vehicle-panel" role="dialog" aria-label={`Автомобиль ${vehicle.id}`}>
    <header><h2>{model.id} <small>№{vehicle.id}</small></h2><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
    <p>{vehicle.category} · {fuelName[vehicle.fuel]}</p>
    <dl><div><dt>Бак</dt><dd>{(vehicle.tankCapacityMl/1000).toFixed(0)} л</dd></div><div><dt>Остаток</dt><dd>{(current/1000).toFixed(1)} л · {Math.round(100*current/vehicle.tankCapacityMl)}%</dd></div>
      <div><dt>Покупка</dt><dd>{behavior[vehicle.behavior]}</dd></div><div><dt>Запрос</dt><dd>{(requested/1000).toFixed(1)} л</dd></div>
      <div><dt>Состояние</dt><dd>{vehicle.servicePhase&&['fueling','finishing'].includes(vehicle.status)?phase[vehicle.servicePhase]:vehicle.status==='parked'?(vehicle.wantsShop&&vehicle.wantsCafe?'В магазине и кафе':vehicle.wantsShop?'В магазине':'В кафе'):status[vehicle.status]}</dd></div>
      {customer&&<div><dt>Покупки</dt><dd>{customer.current==='shop'?'Магазин':'Кафе'} · {customer.waiting?'ожидает обслуживания':'обслуживается'}</dd></div>}
      {vehicle.pumpId&&<div><dt>ТРК</dt><dd>№{Number(vehicle.pumpId.split('-')[1])}</dd></div>}
      {vehicle.refusalReason&&<div><dt>Причина отказа</dt><dd>{vehicle.refusalReason}</dd></div>}
    </dl>
  </aside>;
}
