import { GOODS_DRIVE_SECONDS, goodsDeliveryActive, goodsPose, goodsUnloadSeconds } from '../domain/goodsDelivery';
import { PARKING_SLOTS, PARKING_X, TRUCK_BAY } from '../domain/roadNetwork';
import { version } from '../../../package.json';
import { canPlacePump, cloneInitialStation, cloneLegacyStation, FUEL_IDS, isValidPumpFuels, TRAFFIC_CONFIG } from '../domain/config';
import { pumpQueuePoint, ROAD_NODES } from '../domain/roadNetwork';
import { PUMP_SLOTS } from '../domain/world';
import { deliveryPose } from '../domain/deliveryMotion';
import { footprintBlocked, sweptBlocked } from './collisions';
import { modelById } from '../domain/vehicleModels';
import { normalizeStationName } from '../domain/stationName';
import { ECONOMY, levelTariff, pumpLevel, tankLevel } from '../domain/economy';
import { advanceMarket, createMarket, marketOffer, nefteoptDiscount, NEFTEOPT, supplierById, SUPPLIERS } from '../domain/market';
import { advanceCompetition, competitionVisitFactor, createCompetition, enforceCompetitorPriceFloor, marketAverage } from '../domain/competitors';
import type { CompetitionState } from '../domain/competitors';
import type { MarketState } from '../domain/market';
import type { ConstructionJob, DeliveryTrip, ExpenseTotals, FinanceEvent, FinanceKind, FuelId, GameState, Pump, Sale, StationState, TrafficStats, Vehicle } from '../domain/types';
import { INITIAL_GAME_SECONDS } from './time';
import { condition, contractorPose, CONTRACTORS, createTechnicalState, estimateRepair, proportionalDraw, resaleKopeks, SERVICE_ENTRANCE, wearPump, wearTank } from '../domain/technical';
import type { AutomationMode, EquipmentKind, RepairTask, TechnicalState } from '../domain/technical';
import { SKU, PRODUCTS, RECIPES, VENUES, STAFF_SPEED, TRAIN_COST, SUPPLIERS as GOODS_SUPPLIERS, buyPrice, usedSpace, addStock, consume, createCommerce } from '../domain/commerce';
import type { CommerceState, Venue, Sku, Product, Supplier } from '../domain/commerce';
import { createVehicle, passengerTrafficMultiplier, priceForVolume, purchaseLimitMl, RandomSource, truckTrafficMultiplier } from './traffic';

const NODES = new Map(ROAD_NODES.map((node) => [node.id, node]));
const EMPTY_STATS: TrafficStats = { passed: 0, visited: 0, departed:0, purchases: 0, leftQueue: 0, unserved: 0, soldMl: 0, revenueKopeks: 0, costKopeks: 0 };
const EMPTY_EXPENSES: ExpenseTotals = {lightingKopeks:0,pumpElectricityKopeks:0,tankMaintenanceKopeks:0,pumpingKopeks:0,
  lightingRemainder:0,pumpRemainder:0,tankRemainder:0,pumpingRemainder:0,purchasesKopeks:0,capitalKopeks:0,
  stockValueKopeks:Object.fromEntries(FUEL_IDS.map(id=>[id,0])) as Record<FuelId,number>};
const FINANCE_KINDS:FinanceKind[]=['sale','lighting','pumpElectricity','tankMaintenance','pumping','purchase','construction','upgrade','technicianSalary','equipmentRepair','technicianStaff','resale','goodsPurchase','goodsSale','goodsSalary','goodsMaintenance','goodsCapital','purchaseRefund','goodsRefund'];
const PUMP_ROUTES: Record<string, string[]> = Object.fromEntries(PUMP_SLOTS.map(slot=>[
  `pump-${slot.slot+1}`,[`pump_${slot.slot+1}_approach`,`pump_${slot.slot+1}_turn`,`pump_${slot.slot+1}_align`,`pump_${slot.slot+1}`],
]));
const EXIT_ROUTE = ['exit_lane','exit','exit_merge','west_lane_1_west'];
const TRUCK_PARKING_SLOT = PARKING_SLOTS.length;
const EXIT_APRONS:Record<string,string>={exit_lane:'exit_apron',truck_exit_lane:'truck_exit_apron'};
const TRUCK_EXIT_ROUTE = ['truck_exit_lane','truck_exit','truck_exit_merge','west_lane_1_west'];

function availableMl(station: StationState, vehicles: readonly Vehicle[], fuel: FuelId): number {
  const held = vehicles.reduce((sum, vehicle) =>
    sum + ((vehicle.status === 'toPump' || vehicle.status === 'fueling') && vehicle.fuel === fuel
      ? Math.max(0, vehicle.reservedMl - vehicle.deliveredMl) : 0), 0);
  const usable=station.tanks.filter(t=>t.fuel===fuel&&t.status==='active'&&condition(t)>0).reduce((sum,t)=>sum+t.stockMl,0);
  return Math.max(0,usable-held);
}
function moveToward(vehicle: Vehicle, target: {x:number;y:number}, distance: number, others: readonly Vehicle[] = [], reverse = false, allowStraight = false): number {
  const dx=target.x-vehicle.x,dy=target.y-vehicle.y,length=Math.hypot(dx,dy);
  if(length<.0001)return distance;
  const desired=Math.atan2(dy,dx)+(reverse?Math.PI:0);
  const delta=Math.atan2(Math.sin(desired-vehicle.angle),Math.cos(desired-vehicle.angle));
  const maxStep=Math.min(distance,length);
  let turn=Math.max(-.14,Math.min(.14,delta));
  const candidate=(step:number)=>({x:vehicle.x+dx/length*step,y:vehicle.y+dy/length*step,
    angle:vehicle.angle+turn*(step/maxStep)});
  let step=maxStep,point=candidate(step);
  if(allowStraight&&sweptBlocked(vehicle,point.x,point.y,point.angle,others)&&
    !sweptBlocked(vehicle,point.x,point.y,vehicle.angle,others)){
    turn=0;
    point=candidate(step);
  }
  if(sweptBlocked(vehicle,point.x,point.y,point.angle,others)) {
    let low=0,high=step;
    for(let i=0;i<8;i++) {const mid=(low+high)/2,trial=candidate(mid);
      if(sweptBlocked(vehicle,trial.x,trial.y,trial.angle,others))high=mid;else low=mid;
    }
    step=low;point=candidate(step);
  }
  if(step<.001)return distance;
  vehicle.x=point.x;vehicle.y=point.y;vehicle.angle=point.angle;
  return distance-step;
}
function queuePoint(index:number): {x:number;y:number} {
  return index===0?{x:1850,y:685}:index===1?{x:1840,y:820}:{x:1740-(index-2)*110,y:820};
}
function assignedQueuePoint(vehicle:Vehicle):{x:number;y:number}{
  const slot=Number(vehicle.pumpId?.split('-')[1])-1;
  return Number.isInteger(slot)&&slot>=0&&slot<PUMP_SLOTS.length?pumpQueuePoint(slot):queuePoint(0);
}

export class StationSimulation {
  readonly station: StationState;
  readonly stats: TrafficStats = {...EMPTY_STATS};
  readonly trafficDaily:Record<number,TrafficStats>={};
  readonly vehicles: Vehicle[]=[];
  readonly queueIds: number[]=[];
  readonly recentSales: Sale[]=[];
  readonly financeEvents: FinanceEvent[]=[];
  readonly deliveries: DeliveryTrip[]=[];
  readonly supplierReservedLitres: Record<string,number>={};
  readonly expenses: ExpenseTotals={...EMPTY_EXPENSES,stockValueKopeks:{...EMPTY_EXPENSES.stockValueKopeks}};
  readonly technical: TechnicalState;
  readonly commerce:CommerceState=createCommerce();
  private nextJobId=1;
  private nextDeliveryId=1;
  market:MarketState=createMarket(INITIAL_GAME_SECONDS);
  competition:CompetitionState=createCompetition(INITIAL_GAME_SECONDS,this.market.baseKopeks);
  gameSeconds=INITIAL_GAME_SECONDS;
  private rng: RandomSource;
  private nextVehicleId=0;
  private nextSpawnSeconds=INITIAL_GAME_SECONDS;
  private finishedIds=new Set<number>();
  private stepBlockers:Vehicle[]|undefined;
  private stallInfo=new Map<number,{x:number;y:number;seconds:number}>();
  private lastFinanceCompactDay=-1;

  constructor(seed:number=TRAFFIC_CONFIG.seed,station:StationState=cloneInitialStation()) {
    this.rng=new RandomSource(seed);
    this.station=station;
    this.technical=createTechnicalState(this.gameSeconds);
    for(const pump of station.pumps)pump.condition=condition(pump);
    for(const tank of station.tanks)tank.condition=condition(tank);
    for(const id of FUEL_IDS)this.expenses.stockValueKopeks[id]=priceForVolume(station.fuels[id].stockMl,station.fuels[id].wholesaleKopeks);
  }
  private record(kind:FinanceKind,amountKopeks:number,fuel?:FuelId,volumeMl?:number,objectId?:string):void {
    if(amountKopeks>0)this.financeEvents.push({gameSeconds:this.gameSeconds,kind,amountKopeks,fuel,volumeMl,objectId});
  }
  private compactFinanceHistory():void {
    const day=Math.floor(this.gameSeconds/86400);
    if(day===this.lastFinanceCompactDay)return;
    this.lastFinanceCompactDay=day;
    const recentCutoff=this.gameSeconds-31*86400;
    const oldestVisibleWeek=Math.floor(this.gameSeconds/604800)-11;
    const rollable=new Set<FinanceKind>(['sale','goodsSale','lighting','pumpElectricity','tankMaintenance','pumping']);
    const grouped=new Map<string,FinanceEvent>();
    const detailed:FinanceEvent[]=[];
    for(const event of this.financeEvents){
      if(event.gameSeconds>=recentCutoff||!rollable.has(event.kind)){detailed.push(event);continue;}
      const week=Math.floor(event.gameSeconds/604800);
      const bucketSeconds=week<oldestVisibleWeek?0:week*604800;
      const key=JSON.stringify([bucketSeconds,event.kind,event.fuel,event.objectId]);
      const existing=grouped.get(key);
      if(existing){existing.amountKopeks+=event.amountKopeks;existing.costKopeks=(existing.costKopeks??0)+(event.costKopeks??0);existing.volumeMl=(existing.volumeMl??0)+(event.volumeMl??0);existing.aggregated=(existing.aggregated??1)+(event.aggregated??1);}
      else grouped.set(key,{gameSeconds:bucketSeconds,kind:event.kind,amountKopeks:event.amountKopeks,costKopeks:event.costKopeks,fuel:event.fuel,volumeMl:event.volumeMl,objectId:event.objectId,aggregated:event.aggregated??1});
    }
    if(grouped.size===0)return;
    this.financeEvents.splice(0,this.financeEvents.length,...grouped.values(),...detailed);
    this.financeEvents.sort((a,b)=>a.gameSeconds-b.gameSeconds);
  }
  snapshot(): GameState {
    return {
      gameSeconds:this.gameSeconds,
      station:{balanceKopeks:this.station.balanceKopeks,name:normalizeStationName(this.station.name),
        fuels:Object.fromEntries(Object.entries(this.station.fuels).map(([id,fuel])=>[id,{...fuel}])) as StationState['fuels'],
        pumps:this.station.pumps.map((pump)=>({...pump,fuels:[...pump.fuels]})),
        tanks:this.station.tanks.map((tank)=>({...tank})),jobs:(this.station.jobs??[]).map(job=>({...job,fuels:job.fuels?[...job.fuels]:undefined}))},
      vehicles:this.vehicles.map((vehicle)=>({...vehicle,route:[...vehicle.route],tankIds:vehicle.tankIds?[...vehicle.tankIds]:undefined})),
      queueIds:[...this.queueIds],stats:{...this.stats},trafficDaily:structuredClone(this.trafficDaily),recentSales:this.recentSales.map((sale)=>({...sale})),
      deliveries:this.deliveries.map(trip=>({...trip,cargo:{...trip.cargo},remainingCargo:trip.remainingCargo?{...trip.remainingCargo}:undefined,
        unitPrices:trip.unitPrices?{...trip.unitPrices}:undefined,sections:trip.sections?.map(section=>({...section}))})),
      expenses:{...this.expenses,stockValueKopeks:{...this.expenses.stockValueKopeks}},
      supplierReservedLitres:{...this.supplierReservedLitres},
      market:this.market,
      competition:this.competition,
      // Append-only ledger: sharing it avoids cloning years of history for each visual frame.
      financeEvents:this.financeEvents,
      commerce:structuredClone(this.commerce),
      technical:{...this.technical,technicians:this.technical.technicians.map(t=>({...t})),tasks:this.technical.tasks.map(t=>({...t})),history:this.technical.history.map(h=>({...h})),cooldown:{...this.technical.cooldown},departing:this.technical.departing.map(d=>({...d}))},
    };
  }
  exportSave() {
    const state={...this.snapshot(),financeEvents:this.financeEvents.map(event=>{
      const row:(number|string|null)[]=[event.gameSeconds,FINANCE_KINDS.indexOf(event.kind),event.amountKopeks];
      if(event.costKopeks!==undefined||event.fuel!==undefined||event.volumeMl!==undefined||event.objectId!==undefined||event.id!==undefined||event.productId!==undefined||event.aggregated!==undefined)row.push(event.costKopeks??null,event.fuel?FUEL_IDS.indexOf(event.fuel):null,event.volumeMl??null,event.objectId??null,event.id??null,event.productId??null,event.aggregated??null);
      return row;
    })};
    return {version,parkingLayout:'single-fence',state,rngState:this.rng.getState(),nextVehicleId:this.nextVehicleId,
      nextSpawnSeconds:this.nextSpawnSeconds,nextJobId:this.nextJobId,nextDeliveryId:this.nextDeliveryId};
  }
  static importSave(raw:unknown):StationSimulation {
    if(!raw||typeof raw!=='object')throw new Error('Invalid save');
    const save=raw as {version?:string;parkingLayout?:string;state?:GameState;rngState?:number;nextVehicleId?:number;nextSpawnSeconds?:number;nextJobId?:number;nextDeliveryId?:number};
    const state=(save.state??raw) as GameState;
    if(!state.station||!Number.isFinite(state.station.balanceKopeks)||!Number.isFinite(state.gameSeconds)||!Array.isArray(state.vehicles)||!Array.isArray(state.queueIds)||!state.station.fuels||!Array.isArray(state.station.tanks)||!Array.isArray(state.station.pumps))throw new Error('Invalid save state');
    const station=['0.2.8','0.3.0','0.3.1','0.3.2','0.4.0','0.5.0','0.5.1','0.5.2','0.6.0','0.7.0','0.7.3','0.7.4','0.7.5','0.7.6','0.8.0','0.8.1',version].includes(save.version??'')?cloneInitialStation():cloneLegacyStation();
    station.name=normalizeStationName(state.station.name);
    if(Number.isFinite(state.station.balanceKopeks))station.balanceKopeks=state.station.balanceKopeks;
    for(const id of FUEL_IDS)if(state.station.fuels?.[id])station.fuels[id]={...station.fuels[id],...state.station.fuels[id]};
    station.tanks=(state.station.tanks??station.tanks).map(t=>({...t,status:t.status??'active',condition:condition(t)}));
    station.pumps=(state.station.pumps??station.pumps).filter(p=>Number.isInteger(p.slot)&&p.slot>=0&&p.slot<PUMP_SLOTS.length).map(p=>({...p,fuels:[...p.fuels],status:p.status??'ready',flowMultiplier:p.flowMultiplier??1,enabled:p.enabled??true,condition:condition(p),...(save.version!=='0.8.1'&&condition(p)<100?{pumpedMlSinceRepair:Math.round((100-condition(p))*600_000)}:{})}));
    station.jobs=(state.station.jobs??[]).map(j=>({...j,fuels:j.fuels?[...j.fuels]:undefined}));
    const sim=new StationSimulation(TRAFFIC_CONFIG.seed,station);
    sim.gameSeconds=state.gameSeconds;
    if(state.commerce){const c=state.commerce;if(!c.stock||!c.venues||!Array.isArray(c.orders)||!Array.isArray(c.parking)||Object.values(c.stock).some(stock=>!stock||!Number.isFinite(stock.quantity)||stock.quantity<0||!Number.isFinite(stock.valueKopeks)||stock.valueKopeks<0))throw new Error('Invalid commerce save');Object.assign(sim.commerce,c);sim.commerce.stock={...createCommerce().stock,...c.stock};sim.commerce.prices={...createCommerce().prices,...c.prices};sim.commerce.venues={shop:{...createCommerce().venues.shop,...c.venues?.shop,queue:[...(c.venues?.shop?.queue??[])]},cafe:{...createCommerce().venues.cafe,...c.venues?.cafe,queue:[...(c.venues?.cafe?.queue??[])]}};sim.commerce.parking=[...createCommerce().parking];sim.commerce.customers={...(c.customers??{})};}
    Object.assign(sim.technical,createTechnicalState(state.gameSeconds),state.technical??{});
    sim.technical.mode='manual';sim.technical.technicians=[];sim.technical.notice=undefined;
    sim.technical.tasks=(state.technical?.tasks??[]).filter(t=>!!t.paid).map((t,index)=>({...t,contractor:t.contractor??'standard' as const,technicianId:undefined,source:'manual' as const,parkingSlot:t.parkingSlot??index})).filter((task,index,tasks)=>tasks.findIndex(other=>other.equipmentId===task.equipmentId)===index);
    sim.technical.history=(state.technical?.history??[]).map(h=>({...h}));
    sim.technical.cooldown={...(state.technical?.cooldown??{})};
    sim.technical.departing=(state.technical?.departing??[]).filter(d=>d.kind==='contractor').map(d=>({...d}));
    sim.market=state.market??createMarket(state.gameSeconds);
    if(!sim.market.warehouses.nefteopt)sim.market.warehouses.nefteopt=createMarket(state.gameSeconds).warehouses.nefteopt;
    sim.competition=state.competition??createCompetition(state.gameSeconds,sim.market.baseKopeks);
    if(!state.market)for(const id of FUEL_IDS){sim.market.baseKopeks[id]=station.fuels[id].wholesaleKopeks;sim.market.targetKopeks[id]=station.fuels[id].wholesaleKopeks;}
    enforceCompetitorPriceFloor(sim.competition,sim.gameSeconds,sim.market.baseKopeks);
    Object.assign(sim.stats,EMPTY_STATS,state.stats??{});
    Object.assign(sim.trafficDaily,state.trafficDaily??{});
    sim.vehicles.push(...(state.vehicles??[]).map(v=>{
      const copy:Vehicle={...v,modelId:v.modelId??'budget-sedan',route:[...v.route],tankIds:v.tankIds?[...v.tankIds]:undefined};
      if(!copy.tankIds&&['toPump','fueling','finishing'].includes(copy.status))copy.tankIds=station.tanks.filter(t=>t.fuel===copy.fuel&&t.status==='active').map(t=>t.id);
      if(v.status==='fueling'){
        copy.servicePhase=v.deliveredMl>0||v.servicePhase==='dispensing'?'dispensing':'preparing';
        copy.phaseRemainingSeconds=copy.servicePhase==='preparing'?Math.min(20,Math.max(0,v.phaseRemainingSeconds??20)):0;
      }else if(!['0.5.1','0.5.2','0.6.0','0.7.0','0.7.3','0.7.4','0.7.5','0.7.6','0.8.0','0.8.1',version].includes(save.version??'')){delete copy.servicePhase;delete copy.phaseRemainingSeconds;}
      return copy;
    }));
    if(state.stats?.departed===undefined)sim.stats.departed=Math.max(0,sim.stats.visited-sim.vehicles.filter(v=>v.status!=='road').length);
    // Old two-row saves keep all ten reservations and current orders. Active
    // customers are moved to their new bay once, before traffic resumes.
    const migrateParking=save.parkingLayout!=='single-fence'||save.version!==version;
    for(const [oldSlot,id] of (state.commerce?.parking??[]).entries()){
      if(id===null||sim.commerce.parking.includes(id))continue;
      const vehicle=sim.vehicles.find(v=>v.id===id);if(!vehicle)continue;
      const slot=oldSlot<sim.commerce.parking.length&&sim.commerce.parking[oldSlot]===null?oldSlot:sim.commerce.parking.indexOf(null);
      if(slot<0){vehicle.parkSlot=undefined;delete sim.commerce.customers[id];for(const venue of ['shop','cafe'] as Venue[]){const v=sim.commerce.venues[venue];v.queue=v.queue.filter(customer=>customer!==id);if(v.serving===id)v.serving=undefined;}sim.setRoute(vehicle,[...EXIT_ROUTE],'leaving');continue;}
      sim.commerce.parking[slot]=id;vehicle.parkSlot=slot;
      if(vehicle.status==='toParking'&&migrateParking)sim.setRoute(vehicle,['parking_entry',`parking_access_${slot}`,`parking_${slot}`],'toParking');
      else if(vehicle.status==='parked'&&migrateParking){const node=ROAD_NODES.find(n=>n.id===`parking_${slot}`)!;vehicle.x=node.x;vehicle.y=node.y;vehicle.angle=PARKING_SLOTS[slot].angle;}
      else if(vehicle.status==='leaving'&&migrateParking){
        vehicle.parkSlot=undefined;sim.commerce.parking[slot]=null;
      }
    }
    if(!sim.vehicles.some(vehicle=>vehicle.id===sim.commerce.truckParking&&vehicle.parkSlot===TRUCK_PARKING_SLOT)){
      sim.commerce.truckParking=undefined;
    }
    for(const [id] of Object.entries(sim.commerce.customers)){
      if(!sim.commerce.parking.includes(Number(id))&&sim.commerce.truckParking!==Number(id))delete sim.commerce.customers[Number(id)];
    }
    sim.queueIds.push(...(state.queueIds??[]).filter(id=>sim.vehicles.some(v=>v.id===id)));
    sim.recentSales.push(...(state.recentSales??[]).map(sale=>({...sale})));
    if(state.financeEvents!==undefined){
      if(!Array.isArray(state.financeEvents))throw new Error('Invalid finance history');
      for(const rawEvent of state.financeEvents){
        const event=Array.isArray(rawEvent)?{gameSeconds:rawEvent[0],kind:FINANCE_KINDS[rawEvent[1]],amountKopeks:rawEvent[2],...(rawEvent[3]===null||rawEvent[3]===undefined?{}:{costKopeks:rawEvent[3]}),fuel:rawEvent[4]===null||rawEvent[4]===undefined?undefined:FUEL_IDS[rawEvent[4]],volumeMl:rawEvent[5]??undefined,objectId:rawEvent[6]??undefined,id:rawEvent[7]??undefined,productId:rawEvent[8]??undefined,aggregated:rawEvent[9]??undefined}:rawEvent as FinanceEvent;
        if(!Number.isFinite(event.gameSeconds)||!Number.isFinite(event.amountKopeks)||!FINANCE_KINDS.includes(event.kind))throw new Error('Invalid finance event');
        sim.financeEvents.push({...event});
      }
    }
    sim.compactFinanceHistory();
    for(const pump of station.pumps)if(pump.paidUpgradeKopeks===undefined){
      const recorded=sim.financeEvents.filter(e=>e.kind==='upgrade'&&e.objectId===pump.id).reduce((sum,e)=>sum+e.amountKopeks,0);
      const inferred=recorded||Math.max(0,pumpLevel(pump)-1)*1_200_000;
      if(inferred>0)pump.paidUpgradeKopeks=inferred;
    }
    for(const tank of station.tanks)if(tank.paidUpgradeKopeks===undefined){
      const recorded=sim.financeEvents.filter(e=>e.kind==='upgrade'&&e.objectId===tank.id).reduce((sum,e)=>sum+e.amountKopeks,0);
      const inferred=recorded||Math.max(0,tankLevel(tank)-1)*2_000_000;
      if(inferred>0)tank.paidUpgradeKopeks=inferred;
    }
    sim.deliveries.push(...(state.deliveries??[]).map(trip=>{
      const legacyRemaining={...trip.cargo};
      const onlyFuel=FUEL_IDS.find(id=>trip.cargo[id]!==undefined);
      if(onlyFuel&&Object.keys(trip.cargo).length===1)legacyRemaining[onlyFuel]=trip.remainingMl??trip.cargo[onlyFuel];
      const remainingCargo=trip.remainingCargo?{...trip.remainingCargo}:legacyRemaining;
      const sections=trip.sections?.map(section=>({...section}))??FUEL_IDS.filter(id=>(trip.cargo[id]??0)>0)
        .map(fuel=>({fuel,totalMl:trip.cargo[fuel]??0,remainingMl:remainingCargo[fuel]??0}));
      return {...trip,cargo:{...trip.cargo},remainingCargo,sections,
        unitPrices:trip.unitPrices?{...trip.unitPrices}:undefined,status:trip.status??'enroute'};
    }));
    Object.assign(sim.supplierReservedLitres,state.supplierReservedLitres??{});
    const migratedStockValue={...sim.expenses.stockValueKopeks};
    Object.assign(sim.expenses,EMPTY_EXPENSES,state.expenses??{});
    sim.expenses.stockValueKopeks=state.expenses?.stockValueKopeks?{...state.expenses.stockValueKopeks}:migratedStockValue;
    for(const vehicle of sim.vehicles)if(vehicle.costKopeks===undefined&&vehicle.deliveredMl>0){
      vehicle.costKopeks=priceForVolume(vehicle.deliveredMl,station.fuels[vehicle.fuel].wholesaleKopeks);
      if(!state.expenses)sim.stats.costKopeks+=vehicle.costKopeks;
    }
    // Older saves may contain several active reservations; preserve deliveries and
    // refuse new service until the committed amounts are actually available.
    for(const fuel of FUEL_IDS){
      const active=sim.vehicles.filter(v=>v.fuel===fuel&&['toPump','fueling'].includes(v.status));
      const held=active.reduce((sum,v)=>sum+Math.max(0,v.reservedMl-v.deliveredMl),0);
      const stock=sim.station.tanks.filter(t=>t.fuel===fuel&&t.status==='active'&&condition(t)>0).reduce((sum,t)=>sum+t.stockMl,0);
      if(held>stock)for(const v of [...active].reverse()){
        if(v.deliveredMl>0)continue;
        v.reservedMl=0;v.refusalReason='Недостаточно топлива';v.status='finishing';v.setupRemainingSeconds=0;
        if(active.reduce((sum,x)=>sum+Math.max(0,x.reservedMl-x.deliveredMl),0)<=stock)break;
      }
    }
    if(!['0.2.7','0.2.8','0.3.0','0.3.1','0.3.2','0.4.0','0.5.0','0.5.1','0.5.2','0.6.0','0.7.0','0.7.3','0.7.4','0.7.5','0.7.6','0.8.0',version].includes(save.version??''))for(const v of sim.vehicles){
      const pump=v.pumpId&&sim.station.pumps.find(p=>p.id===v.pumpId);
      if(v.status==='fueling'||v.status==='finishing'){
        if(pump){const point=PUMP_SLOTS[pump.slot];v.x=point.stopX;v.y=point.stopY;v.angle=Math.PI;}
      }else if(v.status==='toPump'&&pump){
        v.x=queuePoint(0).x;v.y=queuePoint(0).y;v.angle=Math.PI;
        v.route=[...PUMP_ROUTES[pump.id]];v.routeIndex=0;
      }else if(v.status==='queued'){
        const index=sim.queueIds.indexOf(v.id);
        if(index>=0){const point=queuePoint(index);v.x=point.x;v.y=point.y;v.angle=-Math.PI/2;}
      }else if(v.status==='entering'){
        v.x=1845;v.y=850;v.angle=-Math.PI/2;v.route=['entrance'];v.routeIndex=0;v.laneId='west_lane_1';v.westbound=true;
      }else if(v.status==='road'){
        v.x=2000-v.x;
        const lane=v.laneId?.startsWith('east')?v.laneId.replace('east','west'):v.laneId?.replace('west','east');
        v.laneId=lane as Vehicle['laneId'];v.westbound=lane?.startsWith('west')??true;
        v.y=NODES.get(`${lane}_${v.westbound?'east':'west'}`)?.y??v.y;
        v.angle=v.westbound?Math.PI:0;v.route=[`${lane}_${v.westbound?'west':'east'}`];v.routeIndex=0;
      }else if(v.status==='leaving'){
        v.angle=Math.PI;
        v.route=v.pumpId&&pump?[`pump_${pump.slot+1}_depart`,`pump_${pump.slot+1}_clear`,`pump_${pump.slot+1}_merge`,...EXIT_ROUTE]:
          v.route.includes('queue_bypass')?['queue_bypass_turn','queue_bypass',...EXIT_ROUTE]:[...EXIT_ROUTE];
        v.routeIndex=0;
      }
    }
    if(!['0.5.1','0.5.2','0.6.0','0.7.0','0.7.3','0.7.4','0.7.5','0.7.6','0.8.0',version].includes(save.version??'')){
      // The old shared queue had no dispenser assignment. Move each waiting
      // customer to a marked bay and repair vehicles trapped at the entrance.
      const redirected=new Set<number>();
      for(const v of sim.vehicles.filter(v=>v.status==='toPump'&&v.category==='truck'&&v.x>1650&&v.y>700)){
        if(!v.pumpId||redirected.has(Number(v.pumpId.split('-')[1])))continue;
        v.x=1850;v.y=685;v.angle=Math.PI;v.route=[...(PUMP_ROUTES[v.pumpId]??[])];v.routeIndex=0;
        redirected.add(Number(v.pumpId.split('-')[1]));
      }
      const pending=sim.vehicles.filter(v=>v.status==='queued'||v.status==='entering');
      sim.queueIds.length=0;
      for(const v of pending){
        const pump=sim.station.pumps.filter(p=>p.status==='ready'&&p.enabled!==false&&p.fuels.includes(v.fuel)&&
          (v.category==='truck'?p.slot%2===0:modelById(v.modelId).length<=(p.slot%2===1?4.7:5.4))&&
          (v.category!=='truck'||!sim.isOccupied(p))&&
          !sim.queueIds.some(id=>sim.vehicles.some(other=>other.id===id&&other.pumpId===p.id)))
          .sort((a,b)=>b.slot-a.slot)[0];
        if(pump&&v.category==='truck'&&sim.reservePump(v,pump)){
          v.x=1850;v.y=685;v.angle=Math.PI;v.status='toPump';v.route=[...(PUMP_ROUTES[pump.id]??[])];v.routeIndex=0;
        }
        else if(pump&&v.category!=='truck'){const point=pumpQueuePoint(pump.slot);v.pumpId=pump.id;v.x=point.x;v.y=point.y;v.angle=Math.PI;v.status='queued';v.route=[];v.routeIndex=0;sim.queueIds.push(v.id);}
        else {v.pumpId=undefined;v.x=320;v.y=650;v.angle=Math.PI;v.route=['exit','exit_merge','west_lane_1_west'];v.routeIndex=0;v.status='leaving';sim.stats.leftQueue++;}
      }
    }
    if(Number.isInteger(save.rngState))sim.rng.setState(save.rngState!);
    sim.nextVehicleId=save.nextVehicleId??Math.max(0,...sim.vehicles.map(v=>v.id))+1;
    sim.nextSpawnSeconds=save.nextSpawnSeconds??sim.gameSeconds+TRAFFIC_CONFIG.spawnSlotSeconds;
    sim.nextJobId=save.nextJobId??station.jobs.length+1;
    sim.nextDeliveryId=save.nextDeliveryId??sim.deliveries.length+1;
    return sim;
  }
  setRetailPrice(fuel:FuelId,kopeks:number):boolean {
    if(!Number.isInteger(kopeks)||kopeks<100||kopeks>99900) return false;
    this.station.fuels[fuel].retailKopeks=kopeks;
    return true;
  }
  setStationName(value:string):boolean { this.station.name=normalizeStationName(value); return true; }
  private equipment(id:string):{item:Pump|import('../domain/types').FuelTank;kind:EquipmentKind}|undefined {
    const pump=this.station.pumps.find(p=>p.id===id);
    if(pump)return {item:pump,kind:'pump'};
    const tank=this.station.tanks.find(t=>t.id===id);
    return tank?{item:tank,kind:'tank'}:undefined;
  }
  private equipmentPoint(id:string):{x:number;y:number}{
    const pump=this.station.pumps.find(p=>p.id===id);
    if(pump)return {x:PUMP_SLOTS[pump.slot].x-38,y:455};
    const tank=this.station.tanks.find(t=>t.id===id);
    if(tank){const index=this.station.tanks.indexOf(tank);return {x:1322+(index%4)*91,y:220+Math.floor(index/4)*69};}
    return SERVICE_ENTRANCE;
  }
  private closed(id:string):boolean {
    return this.technical.tasks.some(t=>t.equipmentId===id&&t.blocked!==false);
  }
  private usableTank(tank:import('../domain/types').FuelTank):boolean {
    return tank.status==='active'&&condition(tank)>0&&!this.closed(tank.id);
  }
  private usablePump(pump:Pump):boolean {
    return pump.status==='ready'&&pump.enabled!==false&&!pump.pendingAction&&condition(pump)>0&&!this.closed(pump.id);
  }
  private debit(kind:FinanceKind,amount:number,id:string,objectId?:string):boolean {
    if(!Number.isInteger(amount)||amount<0||this.station.balanceKopeks<amount)return false;
    if(this.financeEvents.some(e=>e.id===id))return true;
    this.station.balanceKopeks-=amount;
    if(amount>0)this.financeEvents.push({id,gameSeconds:this.gameSeconds,kind,amountKopeks:amount,objectId});
    return true;
  }
  setAutomation(mode:AutomationMode):boolean {
    return mode==='manual';
  }
  callContractor(equipmentId:string,type:keyof typeof CONTRACTORS):boolean {
    const equipment=this.equipment(equipmentId),contractor=CONTRACTORS[type];
    if(!equipment||!contractor||equipment.item.status==='building'||equipment.item.status==='upgrading'||condition(equipment.item)>=100||this.technical.tasks.some(t=>t.equipmentId===equipmentId))return false;
    const estimate=estimateRepair(equipment.kind,condition(equipment.item),contractor.speed);
    const id=`repair-${this.technical.nextId++}`;
    const callKopeks=contractor.call*100;
    if(!this.debit('equipmentRepair',estimate.partsKopeks+callKopeks,`payment-${id}`,equipmentId))return false;
    const occupied=new Set([...this.technical.tasks.filter(t=>t.contractor).map(t=>t.parkingSlot),...this.technical.departing.filter(d=>d.kind==='contractor').map(d=>d.slot)]);
    let parkingSlot=0;while(occupied.has(parkingSlot))parkingSlot++;
    this.technical.tasks.push({id,equipmentId,kind:equipment.kind,contractor:type,source:'manual',phase:'travel',phaseRemaining:contractor.arrival,
      paid:true,blocked:true,partsKopeks:estimate.partsKopeks,callKopeks,conditionBefore:condition(equipment.item),durationSeconds:estimate.durationSeconds,
      executorName:contractor.name,paymentEventId:`payment-${id}`,parkingSlot});
    this.redirectQueue(equipmentId);return true;
  }
  cancelRepair(equipmentId:string,cooldown=true):boolean {
    const index=this.technical.tasks.findIndex(t=>t.equipmentId===equipmentId&&!t.paid);
    if(index<0)return false;
    const task=this.technical.tasks[index];this.technical.tasks.splice(index,1);
    const tech=this.technical.technicians.find(t=>t.id===task.technicianId);
    if(tech){tech.phase='returning';tech.phaseRemaining=60;tech.returnStartX=tech.x;tech.returnStartY=tech.y;}
    const equipment=this.equipment(equipmentId);
    if(cooldown&&task.source==='manual'&&equipment&&condition(equipment.item)>0)this.technical.cooldown[equipmentId]=this.gameSeconds+3600;
    return true;
  }
  cancelManualRepair(equipmentId:string):boolean {
    if(!this.technical.tasks.some(t=>t.equipmentId===equipmentId&&t.source==='manual'&&!t.paid))return false;
    return this.cancelRepair(equipmentId,true);
  }
  sellPump(id:string):boolean {
    const pump=this.station.pumps.find(p=>p.id===id);
    if(!pump||pump.status!=='ready'||this.isReserved(pump)||this.technical.tasks.some(t=>t.equipmentId===id&&t.paid))return false;
    if(this.technical.tasks.some(t=>t.equipmentId===id))this.cancelRepair(id,false);
    const value=resaleKopeks(pump);
    this.station.pumps.splice(this.station.pumps.indexOf(pump),1);
    this.station.balanceKopeks+=value;this.record('resale',value,undefined,undefined,id);return true;
  }
  sellTank(id:string):boolean {
    const tank=this.station.tanks.find(t=>t.id===id);
    if(!tank||tank.status!=='active'||tank.stockMl>=50_000||this.technical.tasks.some(t=>t.equipmentId===id&&t.paid)||
      this.deliveries.some(d=>d.sections?.some(s=>s.fuel===tank.fuel&&s.remainingMl>0))||this.vehicles.some(v=>v.fuel===tank.fuel&&['toPump','fueling','finishing'].includes(v.status)))return false;
    if(this.technical.tasks.some(t=>t.equipmentId===id))this.cancelRepair(id,false);
    const value=resaleKopeks(tank);
    const discardedMl=tank.stockMl;
    const totalFuelMl=this.station.tanks.filter(t=>t.fuel===tank.fuel).reduce((sum,t)=>sum+t.stockMl,0);
    const discardedCost=totalFuelMl>0?Math.round(this.expenses.stockValueKopeks[tank.fuel]*discardedMl/totalFuelMl):0;
    this.expenses.stockValueKopeks[tank.fuel]=Math.max(0,this.expenses.stockValueKopeks[tank.fuel]-discardedCost);
    this.station.tanks.splice(this.station.tanks.indexOf(tank),1);
    for(const pump of this.station.pumps){if(!pump.fuels.includes(tank.fuel))continue;pump.fuels=pump.fuels.filter(f=>f!==tank.fuel);for(const job of this.station.jobs??[])if(job.kind==='rewire'&&job.targetId===pump.id)job.fuels=job.fuels?.filter(f=>f!==tank.fuel);this.redirectQueue(pump.id);}
    this.recountFuel(tank.fuel);
    this.station.balanceKopeks+=value;this.financeEvents.push({gameSeconds:this.gameSeconds,kind:'resale',amountKopeks:value,costKopeks:discardedCost,fuel:tank.fuel,volumeMl:discardedMl,objectId:id});return true;
  }
  private redirectQueue(pumpId:string):void {
    const pump=this.station.pumps.find(p=>p.id===pumpId);if(!pump)return;
    for(const id of [...this.queueIds]){
      const vehicle=this.vehicles.find(v=>v.id===id&&v.pumpId===pumpId);if(!vehicle)continue;
      const alternative=this.station.pumps.find(p=>p.id!==pumpId&&this.usablePump(p)&&p.fuels.includes(vehicle.fuel)&&
        !this.queueIds.some(otherId=>this.vehicles.some(v=>v.id===otherId&&v.pumpId===p.id))&&!this.isOccupied(p));
      if(alternative){vehicle.pumpId=alternative.id;this.setRoute(vehicle,[`pump_${alternative.slot+1}_queue_entry`,`pump_${alternative.slot+1}_queue`],'entering');}
      else {this.queueIds.splice(this.queueIds.indexOf(id),1);vehicle.pumpId=undefined;vehicle.refusalReason='ТРК закрыта на ремонт';this.setRoute(vehicle,['queue_bypass_turn','queue_bypass',...EXIT_ROUTE],'leaving');this.stats.leftQueue++;}
    }
  }
  private equipmentBusy(task:RepairTask):boolean {
    if(task.kind==='pump')return this.vehicles.some(v=>v.pumpId===task.equipmentId&&['toPump','fueling','finishing'].includes(v.status));
    const tank=this.station.tanks.find(t=>t.id===task.equipmentId);if(!tank)return false;
    return this.vehicles.some(v=>v.status==='fueling'&&v.tankIds?.includes(tank.id))||this.deliveries.some(d=>d.status==='unloading'&&d.unloadingTankId===tank.id);
  }
  private advanceTechnical(seconds:number,_from:number):void {
    for(const task of [...this.technical.tasks]){
      const tech=this.technical.technicians.find(t=>t.id===task.technicianId);
      let workSeconds=seconds;
      if(task.phase==='travel'){
        if(task.contractor&&task.phaseRemaining<=600){
          const current=contractorPose(task.parkingSlot??0,1-task.phaseRemaining/600,'arrival');
          const next=contractorPose(task.parkingSlot??0,1-Math.max(0,task.phaseRemaining-seconds)/600,'arrival');
          if((current.y>=830||next.y>=830)&&sweptBlocked(this.contractorVehicle(task.id,current.x,current.y),next.x,next.y,0,this.trafficBlockers()))continue;
        }
        workSeconds=Math.max(0,seconds-task.phaseRemaining);
        task.phaseRemaining=Math.max(0,task.phaseRemaining-seconds);
        if(tech){
          tech.phaseRemaining=task.phaseRemaining;
          const point=this.equipmentPoint(task.equipmentId),progress=1-Math.min(1,task.phaseRemaining/60);
          tech.x=(task.startX??SERVICE_ENTRANCE.x)+(point.x-(task.startX??SERVICE_ENTRANCE.x))*progress;
          tech.y=(task.startY??SERVICE_ENTRANCE.y)+(point.y-(task.startY??SERVICE_ENTRANCE.y))*progress;
        }
        if(task.phaseRemaining>0)continue;
        task.phase='waiting';if(tech)tech.phase='waiting';
      }
      if(task.phase==='waiting'){
        const item=this.equipment(task.equipmentId)?.item;
        if(!item){this.technical.tasks.splice(this.technical.tasks.indexOf(task),1);continue;}
        if(this.equipmentBusy(task))continue;
        task.phase='working';task.phaseRemaining=task.durationSeconds;task.startedAt=this.gameSeconds;
        if(tech)tech.phase='working';
      }
      if(task.phase==='working'){
        task.phaseRemaining=Math.max(0,task.phaseRemaining-workSeconds);
        if(task.phaseRemaining>0)continue;
        const item=this.equipment(task.equipmentId)?.item;if(item){item.condition=100;if('slot' in item)item.pumpedMlSinceRepair=0;}
        if(!this.technical.history.some(h=>h.id===task.id))this.technical.history.unshift({id:task.id,gameSeconds:this.gameSeconds,equipmentId:task.equipmentId,kind:task.kind,
          conditionBefore:task.conditionBefore,partsKopeks:task.partsKopeks,callKopeks:task.callKopeks,durationSeconds:task.durationSeconds,
          executorName:task.executorName,technicianId:task.technicianId,source:task.source});
        this.technical.tasks.splice(this.technical.tasks.indexOf(task),1);
        this.technical.notice=`Ремонт ${task.kind==='pump'?`ТРК №${this.station.pumps.find(p=>p.id===task.equipmentId)?.slot!==undefined?(this.station.pumps.find(p=>p.id===task.equipmentId)!.slot+1):task.equipmentId.split('-').at(-1)}`:`резервуара №${this.station.tanks.findIndex(t=>t.id===task.equipmentId)+1}`} завершён`;this.technical.noticeId=(this.technical.noticeId??0)+1;
        if(task.contractor){const park=contractorPose(task.parkingSlot??0,0,'departure');this.technical.departing.push({id:`departure-${task.id}`,kind:'contractor',slot:task.parkingSlot,x:park.x,y:park.y,fromX:park.x,fromY:park.y,remaining:600});}
      }
    }
    for(const departing of [...this.technical.departing]){
      const nextRemaining=Math.max(0,departing.remaining-seconds);
      const progress=1-nextRemaining/(departing.kind==='technician'?60:600);
      if(departing.kind==='contractor'){
        const point=contractorPose(departing.slot??0,progress,'departure');
        if((point.y>=830||departing.y>=830)&&sweptBlocked(this.contractorVehicle(departing.id,departing.x,departing.y),point.x,point.y,0,this.trafficBlockers()))continue;
        departing.x=point.x;departing.y=point.y;
      }else{
        departing.x=departing.fromX+(SERVICE_ENTRANCE.x-departing.fromX)*progress;
        departing.y=departing.fromY+(SERVICE_ENTRANCE.y-departing.fromY)*progress;
      }
      departing.remaining=nextRemaining;
      if(departing.remaining===0)this.technical.departing.splice(this.technical.departing.indexOf(departing),1);
    }
    // External masters are called by the player only.
  }
  private addJob(kind:ConstructionJob['kind'],targetId:string,duration:number,fuels?:FuelId[]):void {
    (this.station.jobs??=[]).push({id:`job-${this.nextJobId++}`,kind,targetId,totalSeconds:duration,remainingSeconds:duration,status:'queued',fuels});
  }
  buildPump(slot:number):boolean {
    if(!canPlacePump(this.station.pumps,slot)||this.station.balanceKopeks<2_500_000)return false;
    this.station.balanceKopeks-=2_500_000;
    this.expenses.capitalKopeks+=2_500_000;
    this.record('construction',2_500_000,undefined,undefined,`pump-${slot+1}`);
    const pump:Pump={id:`pump-${slot+1}`,slot,fuels:[],status:'building',flowMultiplier:1,enabled:true,condition:100,purchasePriceKopeks:2_500_000,paidUpgradeKopeks:0};
    this.station.pumps.push(pump);this.addJob('pump',pump.id,360);return true;
  }
  upgradePump(id:string):boolean {
    const pump=this.station.pumps.find(p=>p.id===id);
    if(!pump||pump.status==='building'||pump.status==='upgrading'||pump.pendingAction||this.closed(id)||this.station.balanceKopeks<1_200_000)return false;
    if(this.isReserved(pump)){pump.pendingAction='upgrade';this.redirectQueue(id);return true;}
    return this.startPumpUpgrade(pump);
  }
  private startPumpUpgrade(pump:Pump):boolean {
    const id=pump.id;
    this.station.balanceKopeks-=1_200_000;this.expenses.capitalKopeks+=1_200_000;this.record('upgrade',1_200_000,undefined,undefined,id);pump.paidUpgradeKopeks=(pump.paidUpgradeKopeks??0)+1_200_000;pump.status='upgrading';this.addJob('pump-upgrade',id,10_800);return true;
  }
  buildTank(fuel:FuelId):boolean {
    if(!FUEL_IDS.includes(fuel)||this.station.balanceKopeks<4_000_000)return false;
    this.station.balanceKopeks-=4_000_000;
    this.expenses.capitalKopeks+=4_000_000;
    this.record('construction',4_000_000,fuel,undefined,`tank-${fuel}`);
    const tankNumber=Math.max(this.nextJobId,...this.station.tanks.map(t=>(Number(t.id.split('-').at(-1))||0)+1));
    const tank={id:`tank-${fuel}-${tankNumber}`,fuel,capacityMl:2_500_000,stockMl:0,status:'building' as const,condition:100,purchasePriceKopeks:4_000_000,paidUpgradeKopeks:0};
    this.station.tanks.push(tank);this.addJob('tank',tank.id,900);return true;
  }
  upgradeTank(id:string):boolean {
    const tank=this.station.tanks.find(t=>t.id===id);
    if(!tank||tank.status!=='active'||this.closed(id)||this.station.balanceKopeks<2_000_000||this.vehicles.some(v=>v.fuel===tank.fuel&&(v.status==='fueling'||v.status==='finishing'||v.status==='toPump')))return false;
    this.station.balanceKopeks-=2_000_000;this.expenses.capitalKopeks+=2_000_000;this.record('upgrade',2_000_000,tank.fuel,undefined,id);tank.paidUpgradeKopeks=(tank.paidUpgradeKopeks??0)+2_000_000;tank.status='upgrading';this.addJob('tank-upgrade',id,720);return true;
  }
  orderDelivery(fuel:FuelId,litres:number):boolean {
    if(!FUEL_IDS.includes(fuel)||!Number.isInteger(litres)||litres<=0||litres>20_000)return false;
    const ml=litres*1000,cost=litres*this.station.fuels[fuel].wholesaleKopeks;
    const pending=this.deliveries.reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
    const free=this.station.tanks.filter(t=>t.fuel===fuel&&this.usableTank(t)).reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-pending;
    if(ml>free||cost>this.station.balanceKopeks)return false;
    this.station.balanceKopeks-=cost;this.expenses.purchasesKopeks+=cost;
    this.record('purchase',cost,fuel,ml);
    this.deliveries.push({id:`delivery-${this.nextDeliveryId++}`,cargo:{[fuel]:ml},remainingCargo:{[fuel]:ml},sections:[{fuel,totalMl:ml,remainingMl:ml}],unitPrices:{[fuel]:this.station.fuels[fuel].wholesaleKopeks},supplierId:'legacy',paidKopeks:cost,
      arrivalGameSeconds:this.gameSeconds+7200,status:'enroute',remainingMl:ml,totalMl:ml});
    return true;
  }
  getOffers(fuel:FuelId) {
    return SUPPLIERS.map(s=>marketOffer(this.market,s.id,fuel,this.gameSeconds)!);
  }
  orderTrip(supplierId:string,request:Partial<Record<FuelId,number>>|readonly {fuel:FuelId;litres:number}[]):boolean {
    if(supplierId==='union')supplierId='regional';
    const entries:[FuelId,number][]=Array.isArray(request)?request.map(section=>[section.fuel,section.litres]):Object.entries(request) as [FuelId,number][];
    const bulk=supplierId==='nefteopt',totalLitres=entries.reduce((sum,[,litres])=>sum+litres,0);
    if(entries.length<1||entries.length>(bulk?NEFTEOPT.maxFuels:3)||entries.some(([fuel,litres])=>!FUEL_IDS.includes(fuel)||!Number.isInteger(litres)||litres<=0||litres>(bulk?NEFTEOPT.maxLitres:8_000))||
      totalLitres>(bulk?NEFTEOPT.maxLitres:24_000)||(bulk&&totalLitres<NEFTEOPT.minLitres))return false;
    const totals=new Map<FuelId,number>();
    for(const [fuel,litres] of entries)totals.set(fuel,(totals.get(fuel)??0)+litres);
    let cost=0;const unitPrices:Partial<Record<FuelId,number>>={};
    for(const [fuel,litres] of totals){
      const offer=this.getOffers(fuel).find(o=>o.supplierId===supplierId);
      if(!offer||offer.availableLitres<litres)return false;
      const pending=this.deliveries.reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
      const free=this.station.tanks.filter(t=>t.fuel===fuel&&this.usableTank(t)).reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-pending;
      if(litres*1000>free)return false;
      const unitPrice=bulk?Math.round(this.market.baseKopeks[fuel]*(1-nefteoptDiscount(totalLitres))):offer.priceKopeks;
      cost+=litres*unitPrice;
      unitPrices[fuel]=unitPrice;
    }
    if(cost>this.station.balanceKopeks)return false;
    const cargo=Object.fromEntries([...totals].map(([fuel,litres])=>[fuel,litres*1000])) as Partial<Record<FuelId,number>>;
    const sections=entries.map(([fuel,litres])=>({fuel,totalMl:litres*1000,remainingMl:litres*1000}));
    const totalMl=entries.reduce((sum,[,litres])=>sum+litres*1000,0);
    this.station.balanceKopeks-=cost;this.expenses.purchasesKopeks+=cost;
    for(const [fuel,litres] of totals)this.record('purchase',litres*(unitPrices[fuel]??0),fuel,litres*1000,supplierId);
    const day=Math.floor(this.gameSeconds/ECONOMY.gameDaySeconds);
    const supplier=supplierById(supplierId)!;
    for(const [fuel,litres] of totals)this.market.warehouses[supplier.id][fuel].litres-=litres;
    this.deliveries.push({id:`delivery-${this.nextDeliveryId++}`,cargo,remainingCargo:{...cargo},sections,unitPrices,supplierId,paidKopeks:cost,
      orderDay:day,
      arrivalGameSeconds:this.gameSeconds+marketOffer(this.market,supplierId,entries[0][0],this.gameSeconds)!.etaGameSeconds,status:'enroute',remainingMl:totalMl,totalMl});
    return true;
  }
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {
    const pump=this.station.pumps.find(candidate=>candidate.id===pumpId);
    if(!pump||pump.status==='building'||pump.status==='upgrading'||this.closed(pumpId)||!isValidPumpFuels(fuels)||
      fuels.some(fuel=>!this.station.tanks.some(tank=>tank.fuel===fuel&&this.usableTank(tank))))return false;
    if((this.station.jobs??[]).some(j=>j.kind==='rewire'&&j.targetId===pumpId))return false;
    this.addJob('rewire',pumpId,180,[...fuels]);return true;
  }
  setPumpEnabled(pumpId:string,enabled:boolean):boolean {
    const pump=this.station.pumps.find(p=>p.id===pumpId);
    if(!pump||pump.status!=='ready'||this.closed(pumpId))return false;
    if(!enabled&&this.isReserved(pump)){pump.pendingAction='disable';this.redirectQueue(pumpId);return true;}
    pump.pendingAction=undefined;pump.enabled=enabled;return true;
  }
  private advancePendingPumps():void {
    for(const pump of this.station.pumps){
      if(!pump.pendingAction||this.isReserved(pump))continue;
      const action=pump.pendingAction;pump.pendingAction=undefined;
      if(action==='disable')pump.enabled=false;
      else if(!this.startPumpUpgrade(pump))pump.pendingAction='upgrade';
    }
  }
  private advanceJobs(seconds:number):void {
    this.advancePendingPumps();
    const jobs=this.station.jobs??[];
    let active=jobs.filter(job=>job.status==='active').length;
    for(const job of jobs)if(job.status==='queued'&&active<2){job.status='active';active++;}
    for(const job of [...jobs])if(job.status==='active'){
      job.remainingSeconds=Math.max(0,job.remainingSeconds-seconds);
      if(job.remainingSeconds>0)continue;
      if(job.kind==='rewire'&&this.vehicles.some(v=>v.pumpId===job.targetId&&(['toPump','fueling','finishing'].includes(v.status)||(['leaving','toParking'].includes(v.status)&&v.x>(PUMP_SLOTS[this.station.pumps.find(p=>p.id===job.targetId)?.slot??0].stopX-120)))))continue;
      if(job.kind==='pump'||job.kind==='pump-upgrade'||job.kind==='rewire'){
        const pump=this.station.pumps.find(p=>p.id===job.targetId);
        if(pump){pump.status='ready';if(job.kind==='pump-upgrade')pump.flowMultiplier=(pump.flowMultiplier??1)*1.5;if(job.kind==='rewire'&&job.fuels)pump.fuels=[...job.fuels];}
      } else {const tank=this.station.tanks.find(t=>t.id===job.targetId);if(tank){tank.status='active';if(job.kind==='tank-upgrade')tank.capacityMl+=2_500_000;this.recountFuel(tank.fuel);}}
      jobs.splice(jobs.indexOf(job),1);
    }
  }
  private recountFuel(fuel:FuelId):void {
    const active=this.station.tanks.filter(t=>t.fuel===fuel&&t.status!=='building');
    this.station.fuels[fuel].capacityMl=active.reduce((sum,t)=>sum+t.capacityMl,0);
    this.station.fuels[fuel].stockMl=active.reduce((sum,t)=>sum+t.stockMl,0);
  }
  private chargeExpense(key:'lighting'|'pumpElectricity'|'tankMaintenance',dailyKopeks:number,seconds:number,remainderKey:'lightingRemainder'|'pumpRemainder'|'tankRemainder'):void {
    const numerator=this.expenses[remainderKey]+dailyKopeks*seconds;
    const kopeks=Math.floor(numerator/ECONOMY.gameDaySeconds);
    this.expenses[remainderKey]=numerator-kopeks*ECONOMY.gameDaySeconds;
    const totalKey=key==='lighting'?'lightingKopeks':key==='pumpElectricity'?'pumpElectricityKopeks':'tankMaintenanceKopeks';
    this.expenses[totalKey]+=kopeks;this.station.balanceKopeks-=kopeks;
    this.record(key,kopeks);
  }
  private accrueTimeExpenses(seconds:number):void {
    this.chargeExpense('lighting',ECONOMY.lightingDailyKopeks,seconds,'lightingRemainder');
    const pumpRate=this.station.pumps.filter(p=>p.status==='ready'&&p.enabled!==false).reduce((sum,p)=>sum+levelTariff(pumpLevel(p),ECONOMY.pumpDailyKopeks),0);
    const tankRate=this.station.tanks.filter(t=>t.status!=='building').reduce((sum,t)=>sum+levelTariff(tankLevel(t),ECONOMY.tankDailyKopeks),0);
    this.chargeExpense('pumpElectricity',pumpRate,seconds,'pumpRemainder');
    this.chargeExpense('tankMaintenance',tankRate,seconds,'tankRemainder');
  }
  private accruePumping(ml:number):void {
    const numerator=this.expenses.pumpingRemainder+ml*ECONOMY.pumpingKopeksPerLitre;
    const kopeks=Math.floor(numerator/1000);
    this.expenses.pumpingRemainder=numerator-kopeks*1000;
    this.expenses.pumpingKopeks+=kopeks;this.station.balanceKopeks-=kopeks;
    this.record('pumping',kopeks);
  }
  private deliveryVehicle(trip:DeliveryTrip):Vehicle {
    return {id:-1,modelId:'fuel-tanker',...deliveryPose(trip)} as Vehicle;
  }
  private contractorVehicle(id:string,x:number,y:number):Vehicle {
    return {id:-100000-(Number(id.split('-').at(-1))||0),modelId:'delivery-van',category:'van',x,y,angle:0,status:'road'} as Vehicle;
  }
  private trafficBlockers():Vehicle[] {
    if(this.stepBlockers)return this.stepBlockers;
    const trip=this.deliveries.find(d=>d.status&&d.status!=='enroute'&&d.status!=='waiting');
    const blockers=trip?[...this.vehicles,this.deliveryVehicle(trip)]:[...this.vehicles];
    const goods=this.commerce.orders.find(goodsDeliveryActive);
    if(goods)blockers.push(this.goodsVehicle(goods));
    for(const task of this.technical.tasks.filter(t=>t.contractor&&t.phase!=='travel'||t.contractor&&t.phaseRemaining<=600)){
      const pose=contractorPose(task.parkingSlot??0,task.phase==='travel'?1-task.phaseRemaining/600:1,'arrival');
      if(pose.y>=830)blockers.push(this.contractorVehicle(task.id,pose.x,pose.y));
    }
    for(const departing of this.technical.departing.filter(d=>d.kind==='contractor'&&d.y>=830))blockers.push(this.contractorVehicle(departing.id,departing.x,departing.y));
    return blockers;
  }
  private unloadingFuel():FuelId|undefined {
    const trip=this.deliveries.find(d=>d.status==='unloading');
    return trip?.sections?.find(section=>section.remainingMl>0)?.fuel??(trip?FUEL_IDS.find(id=>(trip.remainingCargo?.[id]??trip.cargo[id]??0)>0):undefined);
  }
  private advanceDeliveries(seconds:number):void {
    for(const trip of this.deliveries)if(trip.status==='enroute'&&trip.arrivalGameSeconds<=this.gameSeconds)trip.status='waiting';
    const active=this.deliveries.find(t=>t.status!=='enroute'&&t.status!=='waiting')??this.deliveries.find(t=>t.status==='waiting');
    if(!active)return;
    if(active.status==='waiting'){
      if(this.commerce.orders.some(goodsDeliveryActive))return;
      const entering=this.deliveryVehicle({...active,status:'approaching',phaseSeconds:0});
      if(footprintBlocked(entering,entering.x,entering.y,entering.angle,this.vehicles))return;
      active.status='approaching';active.phaseSeconds=0;return;
    }
    if(active.status==='approaching'||active.status==='connecting'||active.status==='disconnecting'||active.status==='leaving'){
      const duration=active.status==='approaching'||active.status==='leaving'?600:120;
      const nextPhase=Math.min(duration,(active.phaseSeconds??0)+seconds);
      if(active.status==='approaching'||active.status==='leaving'){
        const now=this.deliveryVehicle(active);
        const next=this.deliveryVehicle({...active,phaseSeconds:nextPhase});
        if(sweptBlocked(now,next.x,next.y,next.angle,this.vehicles))return;
      }
      active.phaseSeconds=nextPhase;
      if(active.phaseSeconds>=duration){
        if(active.status==='leaving'){this.deliveries.splice(this.deliveries.indexOf(active),1);return;}
        active.status=active.status==='approaching'?'connecting':active.status==='connecting'?'unloading':'leaving';
        active.phaseSeconds=0;
      }
      return;
    }
    const unloadSeconds=seconds;
    const cargo=active.remainingCargo??(active.remainingCargo={...active.cargo});
    const section=active.sections?.find(item=>item.remainingMl>0);
    const fuel=section?.fuel??FUEL_IDS.find(id=>(cargo[id]??0)>0);
    if(!fuel){active.status='disconnecting';active.phaseSeconds=0;return;}
    if(this.vehicles.some(v=>v.fuel===fuel&&['toPump','fueling','finishing'].includes(v.status)))return;
    let tank=this.station.tanks.find(t=>t.id===active.unloadingTankId&&active.unloadingFuelId===fuel&&t.stockMl<t.capacityMl);
    if(!tank){
      tank=this.station.tanks.find(t=>t.fuel===fuel&&this.usableTank(t)&&t.stockMl<t.capacityMl);
      active.unloadingTankId=tank?.id;active.unloadingFuelId=fuel;
    }
    if(!tank)return;
    const actual=Math.min(section?.remainingMl??cargo[fuel]??0,tank.capacityMl-tank.stockMl,Math.floor(unloadSeconds*ECONOMY.unloadMlPerGameSecond));
    const original=active.cargo[fuel]??0;
    const previousDelivered=original-(cargo[fuel]??0);
    const unitPrice=active.unitPrices?.[fuel]??this.station.fuels[fuel].wholesaleKopeks;
    const value=priceForVolume(previousDelivered+actual,unitPrice)-priceForVolume(previousDelivered,unitPrice);
    this.expenses.stockValueKopeks[fuel]+=value;
    tank.stockMl+=actual;wearTank(tank,actual);cargo[fuel]=(cargo[fuel]??0)-actual;if(section)section.remainingMl-=actual;
    if(section?.remainingMl===0||tank.stockMl>=tank.capacityMl)active.unloadingTankId=undefined;
    active.remainingMl=Math.max(0,(active.remainingMl??0)-actual);
    this.recountFuel(fuel);
    if(active.remainingMl===0){active.status='disconnecting';active.phaseSeconds=0;}
  }
  openVenue(venue:Venue):boolean {const config=VENUES[venue],v=this.commerce.venues[venue];if(v.level||this.station.balanceKopeks<config.open)return false;this.station.balanceKopeks-=config.open;v.level=1;v.staffLevel=1;v.salaryDay=Math.floor(this.gameSeconds/86400);v.maintenanceDay=v.salaryDay;this.record('goodsCapital',config.open,undefined,undefined,venue);return true;}
  upgradeVenue(venue:Venue):boolean {const v=this.commerce.venues[venue],next=v.level+1;if(v.level<1||next>3)return false;const cost=VENUES[venue].upgrades[next-1];if(this.station.balanceKopeks<cost)return false;this.station.balanceKopeks-=cost;v.level=next;this.record('goodsCapital',cost,undefined,undefined,venue);return true;}
  trainVenue(venue:Venue):boolean {const v=this.commerce.venues[venue],next=v.staffLevel+1;if(!v.level||next>5)return false;const cost=TRAIN_COST[next-1];if(this.station.balanceKopeks<cost)return false;this.station.balanceKopeks-=cost;v.staffLevel=next;this.record('goodsCapital',cost,undefined,undefined,venue);return true;}
  setGoodsPrice(product:Product,price:number):boolean {if(!PRODUCTS[product]||PRODUCTS[product].retail===0||!Number.isInteger(price)||price<100||price>100000)return false;this.commerce.prices[product]=price;return true;}
  orderGoods(supplier:Supplier,request:Partial<Record<Sku,number>>):boolean {if(!GOODS_SUPPLIERS[supplier])return false;const lines=Object.entries(request) as [Sku,number][];if(!lines.length||lines.some(([s,n])=>!SKU[s]||!Number.isInteger(n)||n<=0))return false;const reserved={shop:0,cafe:0},orderLines:CommerceState['orders'][number]['lines']={};let total=0;for(const [sku,quantity] of lines){reserved[SKU[sku].venue]+=quantity*SKU[sku].size;const cost=quantity*buyPrice(sku,this.gameSeconds,supplier);orderLines[sku]={quantity,costKopeks:cost};total+=cost;}for(const venue of ['shop','cafe'] as Venue[])if(reserved[venue]&&(!this.commerce.venues[venue].level||usedSpace(this.commerce,venue)+reserved[venue]>VENUES[venue].capacity[this.commerce.venues[venue].level]+.0001))return false;if(total>this.station.balanceKopeks)return false;this.station.balanceKopeks-=total;const id=`goods-${this.commerce.nextOrder++}`;this.commerce.orders.push({id,placed:this.gameSeconds,arrival:this.gameSeconds+GOODS_SUPPLIERS[supplier].eta,supplier,lines:orderLines,totalKopeks:total,status:'enroute'});this.financeEvents.push({id,gameSeconds:this.gameSeconds,kind:'goodsPurchase',amountKopeks:total});return true;}
  private goodsVehicle(order:CommerceState['orders'][number]):Vehicle {
    return {id:-2,modelId:'medium-truck',category:'truck',...goodsPose(order)} as Vehicle;
  }
  private advanceGoods(seconds:number,from:number):void {
    const orders=this.commerce.orders;
    for(const order of orders){
      if(order.status==='enroute'&&order.arrival<=this.gameSeconds)order.status='waiting';
    }
    let cursor=from;
    while(cursor<this.gameSeconds){
      let order=orders.find(goodsDeliveryActive);
      if(!order){
        order=orders.filter(item=>item.status==='enroute'||item.status==='waiting').sort((a,b)=>a.arrival-b.arrival)[0];
        if(!order||order.arrival>this.gameSeconds)return;
        order.status='waiting';
        if(this.deliveries.some(trip=>trip.status!=='enroute'&&trip.status!=='waiting'))return;
        const entering=this.goodsVehicle({...order,status:'approaching',phaseSeconds:0});
        if(footprintBlocked(entering,entering.x,entering.y,entering.angle,this.vehicles))return;
        cursor=Math.max(cursor,order.arrival);
        order.status='approaching';
      }
      const duration=order.status==='unloading'?goodsUnloadSeconds(order):GOODS_DRIVE_SECONDS;
      const elapsed=order.phaseSeconds??0;
      const used=Math.min(this.gameSeconds-cursor,Math.max(0,duration-elapsed),seconds,30);
      const nextPhase=elapsed+used;
      if(order.status!=='unloading'){
        const current=this.goodsVehicle(order);
        const next=this.goodsVehicle({...order,phaseSeconds:nextPhase});
        if(sweptBlocked(current,next.x,next.y,next.angle,this.vehicles))return;
      }
      order.phaseSeconds=nextPhase;
      cursor+=used;
      if(nextPhase<duration)continue;
      order.phaseSeconds=0;
      if(order.status==='approaching')order.status='unloading';
      else if(order.status==='unloading'){
        if(!order.credited){
          for(const [sku,line] of Object.entries(order.lines) as [Sku,{quantity:number;costKopeks:number}][]){
            addStock(this.commerce.stock[sku],line.quantity,line.costKopeks);
          }
          order.credited=true;
        }
        order.status='leaving';
      }else order.status='delivered';
    }
  }
  private advanceCommerce(seconds:number,from:number):void {
    const c=this.commerce;
    this.advanceGoods(seconds,from);
    const firstDay=Math.floor(from/86400),lastDay=Math.floor(this.gameSeconds/86400);for(const venue of ['shop','cafe'] as Venue[]){const v=c.venues[venue];if(!v.level)continue;for(let day=firstDay+1;day<=lastDay;day++){if(v.salaryDay<day){const amount=Math.round(VENUES[venue].salary*[1,1.18,1.37,1.59,1.84][v.staffLevel-1]);this.station.balanceKopeks-=amount;this.financeEvents.push({id:`${venue}-salary-${day}`,gameSeconds:day*86400,kind:'goodsSalary',amountKopeks:amount,objectId:venue});v.salaryDay=day;}if(v.maintenanceDay<day){const amount=VENUES[venue].maintenance[v.level];this.station.balanceKopeks-=amount;this.financeEvents.push({id:`${venue}-maintenance-${day}`,gameSeconds:day*86400,kind:'goodsMaintenance',amountKopeks:amount,objectId:venue});v.maintenanceDay=day;}}
      if(v.serving!==undefined){v.serviceRemaining=Math.max(0,v.serviceRemaining-seconds);if(v.serviceRemaining===0){this.sellToCustomer(v.serving,venue);v.serving=undefined;}}for(const id of [...v.queue]){const customer=c.customers[id];if(!customer){v.queue.splice(v.queue.indexOf(id),1);continue;}customer.patience-=seconds;if(customer.patience<=0){v.queue.splice(v.queue.indexOf(id),1);v.lost++;this.nextVenue(id);}}
      if(v.serving===undefined&&v.queue.length){const id=v.queue.shift()!;v.serving=id;v.serviceRemaining=VENUES[venue].service*STAFF_SPEED[v.staffLevel-1];const customer=c.customers[id];if(customer)customer.waiting=false;}
    }}
  private sellToCustomer(id:number,venue:Venue):void {const c=this.commerce,customer=c.customers[id];if(!customer)return;const options=(Object.keys(PRODUCTS) as Product[]).filter(p=>PRODUCTS[p].venue===venue&&PRODUCTS[p].retail>0);const hour=Math.floor(this.gameSeconds%86400/3600);const weights=options.map(p=>{let w=1;if(hour>=5&&hour<11&&['espresso','americano','cappuccino','latte','cake','pie'].includes(p))w=2;if(hour>=11&&hour<18&&['water','hotdog','snacks'].includes(p))w=2;if(hour>=18&&['chocolate','cake','latte'].includes(p))w=1.7;return w;});const totalWeight=weights.reduce((a,b)=>a+b,0);let roll=this.rng.next()*totalWeight;const selected=customer.product&&PRODUCTS[customer.product].venue===venue?customer.product:options[weights.findIndex(w=>(roll-=w)<0)]??options[0];const priceFactor=PRODUCTS[selected].retail/c.prices[selected];if(this.rng.next()>Math.min(.95,Math.max(.12,priceFactor*.7))){c.venues[venue].lost++;this.nextVenue(id);return;}const recipe=RECIPES[selected as keyof typeof RECIPES]??{[selected]:1};let cost=0;for(const [sku,qty] of Object.entries(recipe) as [Sku,number][])if(c.stock[sku].quantity<qty){c.venues[venue].lost++;this.nextVenue(id);return;}for(const [sku,qty] of Object.entries(recipe) as [Sku,number][])cost+=consume(c.stock[sku],qty);const revenue=c.prices[selected];this.station.balanceKopeks+=revenue;c.venues[venue].revenueKopeks+=revenue;c.venues[venue].costKopeks+=cost;this.financeEvents.push({id:`goods-sale-${id}-${venue}-${this.gameSeconds}`,gameSeconds:this.gameSeconds,kind:'goodsSale',amountKopeks:revenue,costKopeks:cost,objectId:venue,productId:selected});this.nextVenue(id);}
  private nextVenue(id:number):void {const customer=this.commerce.customers[id];if(!customer)return;const next=customer.plan.shift();if(next){customer.current=next;customer.waiting=true;const config=VENUES[next],v=this.commerce.venues[next];customer.patience=config.patience[0]+this.rng.next()*(config.patience[1]-config.patience[0]);v.queue.push(id);}else {delete this.commerce.customers[id];const vehicle=this.vehicles.find(v=>v.id===id);if(vehicle){vehicle.pumpId=undefined;const route=vehicle.parkSlot===TRUCK_PARKING_SLOT
      ?['truck_parking_depart','truck_parking_curve','truck_parking_clear',...TRUCK_EXIT_ROUTE.slice(2)]
      :[`parking_access_${vehicle.parkSlot}`,'parking_exit',...EXIT_ROUTE.slice(1)];
      this.setRoute(vehicle,route,'leaving');}else {const slot=this.commerce.parking.indexOf(id);if(slot>=0)this.commerce.parking[slot]=null;if(this.commerce.truckParking===id)this.commerce.truckParking=undefined;}}}
  step(seconds:number):void {
    if(!Number.isFinite(seconds)||seconds<=0) return;
    const technicalFrom=this.gameSeconds;
    const statsBefore={...this.stats};
    let remainingTime=seconds;
    while(remainingTime>0){
      this.advanceJobs(0);
      const nextCompletion=Math.min(...(this.station.jobs??[]).filter(job=>job.status==='active'&&job.remainingSeconds>0).map(job=>job.remainingSeconds),Infinity);
      const slice=Math.min(remainingTime,nextCompletion);
      this.accrueTimeExpenses(slice);
      this.gameSeconds+=slice;
      this.advanceJobs(slice);
      remainingTime-=slice;
    }
    this.advanceDeliveries(seconds);
    this.advanceCommerce(seconds,technicalFrom);
    this.compactFinanceHistory();
    advanceMarket(this.market,this.gameSeconds);
    advanceCompetition(this.competition,this.gameSeconds,this.market.baseKopeks,Object.fromEntries(FUEL_IDS.map(id=>[id,this.station.fuels[id].retailKopeks])) as Record<FuelId,number>);
    while(this.nextSpawnSeconds<=this.gameSeconds) {
      this.spawn(this.nextSpawnSeconds);
      this.nextSpawnSeconds+=TRAFFIC_CONFIG.spawnSlotSeconds;
    }
    this.finishedIds.clear();
    const ordered=[...this.vehicles].sort((a,b)=>{
      const priority=(v:Vehicle)=>v.status==='leaving'&&v.route[v.routeIndex]==='exit_lane'?2:v.status==='leaving'?1:0;
      return priority(b)-priority(a)||((a.westbound?-1:1)*(b.x-a.x));
    });
    this.stepBlockers=this.trafficBlockers();
    for(const vehicle of ordered) this.advance(vehicle,seconds);
    this.stepBlockers=undefined;
    this.advanceTechnical(seconds,technicalFrom);
    this.dispatchQueue();
    for(let i=this.vehicles.length-1;i>=0;i--) if(this.finishedIds.has(this.vehicles[i].id)){const v=this.vehicles[i];this.releaseParking(v);this.vehicles.splice(i,1);}
    for(const vehicle of this.vehicles){
      if(['queued','fueling','finishing','parked'].includes(vehicle.status)){this.stallInfo.delete(vehicle.id);continue;}
      const previous=this.stallInfo.get(vehicle.id);
      this.stallInfo.set(vehicle.id,{x:vehicle.x,y:vehicle.y,seconds:previous&&Math.hypot(previous.x-vehicle.x,previous.y-vehicle.y)<.01?previous.seconds+seconds:0});
    }
    // A bad legacy pose or a rare collision must never block the station for
    // hours. This is a final fallback; normal traffic clears through routing.
    for(const vehicle of this.vehicles){
      if((this.stallInfo.get(vehicle.id)?.seconds??0)<TRAFFIC_CONFIG.stalledVehicleSeconds)continue;
      const index=this.queueIds.indexOf(vehicle.id);
      if(index>=0)this.queueIds.splice(index,1);
      if(vehicle.parkSlot!==undefined){this.releaseParking(vehicle);delete this.commerce.customers[vehicle.id];for(const venue of ['shop','cafe'] as Venue[]){const v=this.commerce.venues[venue];v.queue=v.queue.filter(id=>id!==vehicle.id);if(v.serving===vehicle.id)v.serving=undefined;}}
      if(vehicle.status==='road')this.stats.passed++;
      else if(vehicle.status==='entering'||vehicle.status==='toPump')this.stats.unserved++;
      this.finishedIds.add(vehicle.id);
    }
    for(let i=this.vehicles.length-1;i>=0;i--)if(this.finishedIds.has(this.vehicles[i].id))this.vehicles.splice(i,1);
    const activeIds=new Set(this.vehicles.map(v=>v.id));
    for(const id of this.stallInfo.keys())if(!activeIds.has(id))this.stallInfo.delete(id);
    const day=Math.floor(this.gameSeconds/86400);const daily=this.trafficDaily[day]??(this.trafficDaily[day]={...EMPTY_STATS});for(const key of Object.keys(EMPTY_STATS) as (keyof TrafficStats)[])daily[key]+=this.stats[key]-statsBefore[key];
  }
  trafficDiagnostics(thresholdSeconds=60):{id:number;status:string;routeNode:string;stalledSeconds:number;reason:string}[]{
    return this.vehicles.flatMap(vehicle=>{
      const stalledSeconds=this.stallInfo.get(vehicle.id)?.seconds??0;
      if(stalledSeconds<thresholdSeconds)return [];
      const blockers=this.trafficBlockers().filter(other=>other.id!==vehicle.id&&Math.hypot(other.x-vehicle.x,other.y-vehicle.y)<180).map(v=>v.id);
      const routeNode=vehicle.route[vehicle.routeIndex]??'конец маршрута';
      return [{id:vehicle.id,status:vehicle.status,routeNode,stalledSeconds,reason:blockers.length?`рядом автомобили ${blockers.join(', ')}`:routeNode==='exit_lane'?'ожидание выезда':'препятствие или ограничение маршрута'}];
    });
  }
  private spawn(atSeconds:number):void {
    const vehicle=createVehicle(this.nextVehicleId++,atSeconds,this.rng);
    const profile=vehicle.category==='truck'?truckTrafficMultiplier(atSeconds):passengerTrafficMultiplier(atSeconds);
    if(this.rng.next()>=Math.min(.95,TRAFFIC_CONFIG.baseSpawnChance*profile)) return;
    const lane=this.rng.pickWeighted(
      ['west_lane_1','west_lane_2','east_lane_1','east_lane_2'] as const,[.42,.16,.21,.21]);
    vehicle.laneId=lane;
    vehicle.westbound=lane.startsWith('west');
    const start=NODES.get(lane+(vehicle.westbound?'_east':'_west'))!;
    vehicle.x=start.x;vehicle.y=start.y;vehicle.angle=vehicle.westbound?Math.PI:0;
    vehicle.route=vehicle.westbound?(lane==='west_lane_1'?['entrance_decision','west_lane_1_west']:[lane+'_west']):[lane+'_east'];
    vehicle.routeIndex=0;
    if(footprintBlocked(vehicle,vehicle.x,vehicle.y,vehicle.angle,this.trafficBlockers()))return;
    this.vehicles.push(vehicle);
  }
  private setRoute(vehicle:Vehicle,route:readonly string[],status:Vehicle['status']):void {
    vehicle.route=[...route];vehicle.routeIndex=0;vehicle.status=status;
    if(status==='toPump'||status==='leaving')vehicle.speed=0;
  }
  private releaseParking(vehicle:Vehicle):void {
    if(vehicle.parkSlot===TRUCK_PARKING_SLOT)this.commerce.truckParking=undefined;
    else if(vehicle.parkSlot!==undefined)this.commerce.parking[vehicle.parkSlot]=null;
    vehicle.parkSlot=undefined;
  }
  private moveRoute(vehicle:Vehicle,distance:number):void {
    const frontRowOccupied=this.commerce.parking.some((occupant,index)=>index<PARKING_X.length&&occupant!==null);
    let remaining=distance,guard=0;
    while(remaining>0&&vehicle.routeIndex<vehicle.route.length&&guard++<12) {
      const id=vehicle.route[vehicle.routeIndex];
      const target=NODES.get(id);
      if(!target) throw new Error('Unknown road node '+id);
      // Approach the west exit above the parking bays so the parked cars
      // cannot stop through traffic. Also applies to routes restored mid-drive.
      const apron=frontRowOccupied?NODES.get(EXIT_APRONS[id]):undefined;
      const viaApron=!!apron&&vehicle.x>apron.x-3&&vehicle.y>apron.y+3;
      const adjustedLane=apron?NODES.get(id.replace('exit_lane','exit_parking_lane')):undefined;
      const pumpExit=/^pump_\d+_(depart|clear|merge|truck_turn)$/.test(id)&&target.x<790;
      const node=viaApron?apron:adjustedLane??(frontRowOccupied&&pumpExit?{...target,y:Math.min(target.y,626)}:target);
      if((node.x===0||node.x===2000)&&Math.hypot(vehicle.x-node.x,vehicle.y-node.y)<1){vehicle.routeIndex++;continue;}
      const blockers=this.trafficBlockers();
      // At the west exit a follower on the straight lane can pin the rear of
      // a car that has already begun turning. Let the lead car clear the bend.
      const movingBlockers=vehicle.status==='leaving'&&id==='exit'
        ?blockers.filter(other=>!(other.status==='leaving'&&other.x>vehicle.x+75&&Math.abs(other.y-700)<45))
        :vehicle.status==='toPump'&&id.endsWith('_turn')
          ?blockers.filter(other=>!(other.status==='leaving'&&other.route[other.routeIndex]==='exit_lane'&&
            other.x>vehicle.x&&other.x<vehicle.x+120&&other.y<=665))
          :blockers;
      remaining=moveToward(vehicle,node,remaining,movingBlockers,vehicle.status==='leaving'&&(id.startsWith('parking_access_')),id.includes('parking'));
      const stopTolerance=vehicle.category==='truck'&&/^pump_\d+$/.test(id)?38:3;
      if(Math.hypot(vehicle.x-node.x,vehicle.y-node.y)<stopTolerance) {
        if(viaApron)continue;
        vehicle.routeIndex++;
        if(vehicle.status==='leaving'&&(id==='parking_exit'||id==='truck_parking_clear'))this.releaseParking(vehicle);
        // Keep the dispenser assigned until the vehicle has fully left the route.
        if(vehicle.status==='road'&&id==='entrance_decision') this.decideVisit(vehicle);
      } else break;
    }
    if(vehicle.routeIndex>=vehicle.route.length) this.completeRoute(vehicle);
  }
  private completeRoute(vehicle:Vehicle):void {
    if(vehicle.status==='road') {this.stats.passed++;this.finishedIds.add(vehicle.id);}
    else if(vehicle.status==='entering') {
      vehicle.status='queued';vehicle.speed=0;vehicle.waitedSeconds=0;
      if(!this.queueIds.includes(vehicle.id))this.queueIds.push(vehicle.id);
    } else if(vehicle.status==='toPump') {
      vehicle.status='fueling';vehicle.speed=0;vehicle.setupRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds;
      vehicle.angle=Math.PI;
      vehicle.servicePhase='preparing';vehicle.phaseRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds;
      const pump=this.station.pumps.find(p=>p.id===vehicle.pumpId);
      vehicle.serviceRemainingSeconds=vehicle.reservedMl/TRAFFIC_CONFIG.fuelFlowMlPerSecond/(pump?.flowMultiplier??1)*(1+0.5*(100-condition(pump??{condition:100} as Pump))/100);
    } else if(vehicle.status==='toParking'){
      const bay=vehicle.parkSlot===TRUCK_PARKING_SLOT?TRUCK_BAY:PARKING_SLOTS[vehicle.parkSlot!];
      if(sweptBlocked(vehicle,bay.x,bay.y,bay.angle,this.trafficBlockers()))return;
      vehicle.x=bay.x;vehicle.y=bay.y;vehicle.angle=bay.angle;
      vehicle.status='parked';vehicle.pumpId=undefined;vehicle.speed=0;
      this.startCustomer(vehicle.id);
    }else if(vehicle.status==='leaving'){
      this.stats.departed++;this.finishedIds.add(vehicle.id);
    }
  }
  private decideVisit(vehicle:Vehicle):void {
    if(vehicle.laneId!=='west_lane_1')return;
    if(modelById(vehicle.modelId).length<=4.8&&(this.commerce.venues.shop.level||this.commerce.venues.cafe.level)&&this.rng.next()<Math.min(.85,.7+.05*(Math.max(this.commerce.venues.shop.level,this.commerce.venues.cafe.level)-1))*(this.gameSeconds%86400<21600||this.gameSeconds%86400>79200?.55:1)){const slot=this.commerce.parking.indexOf(null);vehicle.wantsShop=!!this.commerce.venues.shop.level&&this.rng.next()<Math.min(.9,.75+.05*(this.commerce.venues.shop.level-1));vehicle.wantsCafe=!!this.commerce.venues.cafe.level&&this.rng.next()<Math.min(.8,.6+.05*(this.commerce.venues.cafe.level-1));if(!vehicle.wantsShop&&!vehicle.wantsCafe)vehicle.wantsShop=!!this.commerce.venues.shop.level;if(slot>=0){this.commerce.parking[slot]=vehicle.id;vehicle.parkSlot=slot;this.stats.visited++;this.setRoute(vehicle,['entrance_curve','entrance','queue_split','parking_entry',`parking_access_${slot}`,`parking_${slot}`],'toParking');return;}vehicle.refusalReason='Нет места на парковке';this.commerce.venues.shop.lost+=Number(!!vehicle.wantsShop);this.commerce.venues.cafe.lost+=Number(!!vehicle.wantsCafe);return;}
    const compatiblePumps=this.station.pumps.filter(pump=>this.usablePump(pump)&&pump.fuels.includes(vehicle.fuel)&&
      (vehicle.category==='truck'?pump.slot%2===0:modelById(vehicle.modelId).length<=(pump.slot%2===1?4.7:5.4)));
    const compatible=compatiblePumps.length>0&&this.station.tanks.some(t=>t.fuel===vehicle.fuel&&this.usableTank(t));
    if(vehicle.tankCapacityMl-vehicle.currentFuelMl<1000){vehicle.refusalReason='Не требуется заправка';return;}
    if(!compatible){vehicle.refusalReason=vehicle.category==='truck'?'Нет места для грузовика':'Нет подходящей колонки';this.stats.unserved++;return;}
    if(this.unloadingFuel()===vehicle.fuel||availableMl(this.station,this.vehicles,vehicle.fuel)<=0){vehicle.refusalReason='Нет нужного топлива';this.stats.unserved++;return;}
    if(this.queueIds.length>=TRAFFIC_CONFIG.maxQueue){vehicle.refusalReason='Большая очередь';this.stats.unserved++;return;}
    const demand=TRAFFIC_CONFIG.demand;
    const priceFactor=competitionVisitFactor(this.competition,vehicle.fuel,this.station.fuels[vehicle.fuel].retailKopeks);
    const queue=this.queueIds.length;
    const probability=Math.max(demand.minimumVisitChance,Math.min(.98,TRAFFIC_CONFIG.baseVisitChance*priceFactor*
      Math.max(.2,1-queue*demand.queuePenalty)*demand.attractiveness*(this.market.modifiers.demandBps??10000)/10000));
    if(this.rng.next()>=probability){const average=marketAverage(this.competition,vehicle.fuel);
      vehicle.refusalReason=average!==undefined&&this.station.fuels[vehicle.fuel].retailKopeks>average+100?'Слишком высокая цена':'Выбрана другая АЗС';return;}
    if(modelById(vehicle.modelId).length<=4.8&&(this.commerce.venues.shop.level||this.commerce.venues.cafe.level)){vehicle.wantsShop=!!this.commerce.venues.shop.level&&this.rng.next()<.28;vehicle.wantsCafe=!!this.commerce.venues.cafe.level&&this.rng.next()<.22;}
    const free=compatiblePumps.filter(p=>!this.isOccupied(p)&&!this.isIslandBusy(p)&&!this.queueIds.some(id=>this.vehicles.some(v=>v.id===id&&v.pumpId===p.id)));
    // Long vehicles enter only when a dispenser and the turning corridor are
    // free. They cannot safely wait side by side at the narrow entrance.
    const entranceBusy=this.vehicles.some(v=>v.id!==vehicle.id&&(['entering','toPump'].includes(v.status))&&v.x>1640&&v.y>640);
    if(vehicle.category==='truck'&&(entranceBusy||free.length===0)){
      vehicle.refusalReason='Нет места для грузовика';this.stats.unserved++;return;
    }
    const direct=free.sort((a,b)=>a.slot-b.slot)[0];
    if(direct){
      if(!this.reservePump(vehicle,direct)){this.stats.unserved++;return;}
      if(vehicle.modelId==='semi-trailer'&&direct.slot===0){
        vehicle.wantsShop=!!this.commerce.venues.shop.level&&this.rng.next()<.28;
        vehicle.wantsCafe=!!this.commerce.venues.cafe.level&&this.rng.next()<.22;
      }
      this.stats.visited++;
      this.setRoute(vehicle,['entrance_curve','entrance','queue_split',...(PUMP_ROUTES[direct.id]??[])],'toPump');
      return;
    }
    const queuePump=compatiblePumps.filter(p=>!this.queueIds.some(id=>this.vehicles.some(v=>v.id===id&&v.pumpId===p.id)))
      .sort((a,b)=>b.slot-a.slot)[0];
    if(!queuePump){vehicle.refusalReason=vehicle.category==='truck'?'Нет места для грузовика':'Нет свободного места у ТРК';this.stats.unserved++;return;}
    vehicle.pumpId=queuePump.id;
    this.stats.visited++;
    this.queueIds.push(vehicle.id);
    this.setRoute(vehicle,['entrance_curve','entrance',`pump_${queuePump.slot+1}_queue_entry`,`pump_${queuePump.slot+1}_queue`],'entering');
  }
  private reservePump(vehicle:Vehicle,pump:Pump):boolean {
    const stock=this.station.fuels[vehicle.fuel];
    const needed=purchaseLimitMl(vehicle,stock.retailKopeks,Number.MAX_SAFE_INTEGER);
    if(needed<=0||needed>availableMl(this.station,this.vehicles,vehicle.fuel)){
      vehicle.refusalReason=needed<=0?'Не требуется заправка':'Недостаточно топлива';return false;
    }
    vehicle.reservedMl=needed;vehicle.salePriceKopeks=stock.retailKopeks;
    vehicle.tankIds=this.station.tanks.filter(t=>t.fuel===vehicle.fuel&&this.usableTank(t)&&t.stockMl>0).map(t=>t.id);
    vehicle.deliveredMl=0;vehicle.costKopeks=0;vehicle.pumpId=pump.id;
    return true;
  }
  private travelDistance(vehicle:Vehicle,base:number,seconds:number):number {
    const model=modelById(vehicle.modelId);
    const accel=model.acceleration*.01,brake=model.braking*.01;
    const finalNode=vehicle.status==='queued'?assignedQueuePoint(vehicle):NODES.get(vehicle.route[vehicle.route.length-1]);
    const distanceToEnd=finalNode?Math.hypot(finalNode.x-vehicle.x,finalNode.y-vehicle.y):Infinity;
    const target=vehicle.status==='road'||vehicle.status==='leaving'?base:Math.min(base,Math.sqrt(Math.max(0,2*brake*distanceToEnd)));
    const current=vehicle.speed??0;
    const next=current<target?Math.min(target,current+accel*seconds):Math.max(target,current-brake*seconds);
    vehicle.speed=next;
    return Math.min(base*seconds,(current+next)*.5*seconds);
  }
  private advance(vehicle:Vehicle,seconds:number):void {
    if(vehicle.status==='road') {
      let travel=this.travelDistance(vehicle,TRAFFIC_CONFIG.roadSpeed,seconds);
      // Keep the approach lane clear while a customer turns north into the station.
      // A follower next to the turn blocks its swept rear corner at 1×.
      if(vehicle.laneId==='west_lane_1'&&vehicle.x>1850&&this.vehicles.some(other=>['entering','toPump'].includes(other.status)&&other.id!==vehicle.id&&other.x>1700&&other.y>690))
        travel=Math.min(travel,Math.max(0,vehicle.x-1980));
      if(vehicle.laneId==='west_lane_1'&&vehicle.x>=500&&this.vehicles.some(other=>other.status==='leaving'&&other.x<=350&&other.y<925&&!other.route.includes('bypass_merge')))travel=Math.min(travel,Math.max(0,vehicle.x-500));
      if(travel>0)this.moveRoute(vehicle,travel);
    }
    else if(vehicle.status==='entering'||vehicle.status==='toPump'||vehicle.status==='leaving'||vehicle.status==='toParking') {
      const currentPumpId=vehicle.pumpId;
      if(vehicle.status==='leaving'&&currentPumpId&&vehicle.route[vehicle.routeIndex]?.endsWith('_depart')&&
        this.vehicles.some(other=>other.id!==vehicle.id&&other.status==='toPump'&&other.pumpId&&
          Math.floor((Number(other.pumpId.split('-')[1])-1)/2)===Math.floor((Number(currentPumpId.split('-')[1])-1)/2)&&
          other.x<vehicle.x+250&&other.x>vehicle.x-200)){
        vehicle.speed=0;return;
      }
      if(vehicle.status==='leaving'&&vehicle.route[vehicle.routeIndex]==='exit_lane'&&vehicle.x>500&&
        this.vehicles.some(other=>other.id!==vehicle.id&&other.status==='leaving'&&other.route[other.routeIndex]==='exit'&&other.x<400)){
        vehicle.speed=0;return;
      }
      const merging=vehicle.status==='leaving'&&vehicle.route[vehicle.routeIndex]?.endsWith('_depart');
      const exitBusy=merging&&this.vehicles.some(other=>other.id!==vehicle.id&&(
        (vehicle.y<650&&other.status==='leaving'&&!other.pumpId&&other.x<vehicle.x+250&&other.x>vehicle.x-160&&other.y>650)||
        (vehicle.y<600&&other.status==='toPump'&&other.x<vehicle.x+180&&other.x>vehicle.x-150&&other.y>650)||
        (other.status==='leaving'&&other.pumpId&&other.pumpId!==vehicle.pumpId&&other.x>vehicle.x&&other.x-vehicle.x<200)));
      if(!exitBusy){
        let travel=this.travelDistance(vehicle,TRAFFIC_CONFIG.stationSpeed,seconds);
        // A car continuing west to a farther dispenser yields to a car
        // crossing the approach lane from a marked queue bay.
        if(vehicle.status==='toPump'&&vehicle.pumpId&&vehicle.y>=640&&vehicle.y<800){
          const slot=Number(vehicle.pumpId.split('-')[1])-1;
          const crossing=this.vehicles.find(other=>other.id!==vehicle.id&&other.status==='toPump'&&other.pumpId&&
            Number(other.pumpId.split('-')[1])-1>slot&&other.x<vehicle.x&&other.x>PUMP_SLOTS[slot].stopX&&
            other.y>620&&other.y<800&&other.route[other.routeIndex]?.includes('_approach'));
          if(crossing)travel=Math.min(travel,Math.max(0,vehicle.x-crossing.x-170));
        }
        this.moveRoute(vehicle,travel);
      }
      else vehicle.speed=0;
    }
    else if(vehicle.status==='queued') {
      vehicle.waitedSeconds+=seconds;
    } else if(vehicle.status==='fueling')this.advanceService(vehicle,seconds);
    else if(vehicle.status==='finishing'){vehicle.setupRemainingSeconds=Math.max(0,vehicle.setupRemainingSeconds-seconds);if(vehicle.setupRemainingSeconds===0)this.endService(vehicle);}
  }
  private advanceService(vehicle:Vehicle,seconds:number):void {
    let left=seconds;
    while(left>0&&vehicle.status==='fueling'){
      const phase=vehicle.servicePhase??'dispensing';
      if(phase==='dispensing'){this.fuel(vehicle,left);break;}
      const duration=Math.max(.001,vehicle.phaseRemainingSeconds??4);
      const elapsed=Math.min(left,duration);left-=elapsed;vehicle.phaseRemainingSeconds=duration-elapsed;
      if(vehicle.phaseRemainingSeconds>0)break;
      vehicle.servicePhase='dispensing';vehicle.phaseRemainingSeconds=0;
    }
  }
  private fuel(vehicle:Vehicle,seconds:number):void {
    const activeSeconds=seconds;
    const stock=this.station.fuels[vehicle.fuel];
    if(vehicle.deliveredMl===0&&stock.stockMl<vehicle.reservedMl){vehicle.refusalReason='Недостаточно топлива';vehicle.reservedMl=0;this.finishSale(vehicle);return;}
    const remaining=Math.max(0,vehicle.reservedMl-vehicle.deliveredMl);
    const pump=this.station.pumps.find(p=>p.id===vehicle.pumpId);
    const tanks=this.station.tanks.filter(candidate=>candidate.fuel===vehicle.fuel&&candidate.status==='active'&&candidate.stockMl>0&&
      (vehicle.tankIds?.includes(candidate.id)??this.usableTank(candidate)));
    const totalTankStock=tanks.reduce((sum,t)=>sum+t.stockMl,0);
    const wearFraction=pump?(100-condition(pump))/100:0;
    const delivered=Math.min(remaining,stock.stockMl,totalTankStock,Math.floor(activeSeconds*TRAFFIC_CONFIG.fuelFlowMlPerSecond*(pump?.flowMultiplier??1)/(1+0.5*wearFraction)));
    const stockBefore=stock.stockMl;
    const valueBefore=this.expenses.stockValueKopeks[vehicle.fuel];
    const cost=stockBefore>0?Math.min(valueBefore,Math.round(valueBefore*delivered/stockBefore)):0;
    vehicle.deliveredMl+=delivered;
    vehicle.costKopeks=(vehicle.costKopeks??0)+cost;
    this.expenses.stockValueKopeks[vehicle.fuel]-=cost;
    this.stats.costKopeks+=cost;
    stock.stockMl-=delivered;
    const shares=proportionalDraw(tanks,delivered);
    for(const [index,tank] of tanks.entries()){tank.stockMl-=shares[index];wearTank(tank,shares[index]);}
    if(pump)wearPump(pump,delivered);
    this.recountFuel(vehicle.fuel);
    this.stats.soldMl+=delivered;
    this.accruePumping(delivered);
    const totalCharge=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
    const charge=totalCharge-vehicle.chargedKopeks;
    vehicle.chargedKopeks=totalCharge;
    this.station.balanceKopeks+=charge;
    this.stats.revenueKopeks+=charge;
    if(delivered>0)this.financeEvents.push({gameSeconds:this.gameSeconds,kind:'sale',amountKopeks:charge,costKopeks:cost,fuel:vehicle.fuel,volumeMl:delivered,objectId:vehicle.pumpId});
    vehicle.serviceRemainingSeconds=Math.max(0,vehicle.serviceRemainingSeconds-seconds);
    if(vehicle.deliveredMl>=vehicle.reservedMl)this.finishSale(vehicle);
  }
  private finishSale(vehicle:Vehicle):void {
    const stock=this.station.fuels[vehicle.fuel];
    const pump=this.station.pumps.find(p=>p.id===vehicle.pumpId);
    if(pump){pump.lastDisplayMl=vehicle.deliveredMl;pump.lastDisplayKopeks=vehicle.chargedKopeks;}
    if(vehicle.deliveredMl>0) {
      const revenueKopeks=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
      const costKopeks=vehicle.costKopeks??priceForVolume(vehicle.deliveredMl,stock.wholesaleKopeks);
      const sale:Sale={vehicleId:vehicle.id,category:vehicle.category,fuel:vehicle.fuel,
        volumeMl:vehicle.deliveredMl,revenueKopeks,costKopeks,gameSeconds:this.gameSeconds};
      this.recentSales.unshift(sale);
      this.recentSales.length=Math.min(this.recentSales.length,TRAFFIC_CONFIG.maxRecentSales);
      this.stats.purchases++;
    } else this.stats.unserved++;
    vehicle.status='finishing';vehicle.servicePhase=undefined;vehicle.setupRemainingSeconds=4;vehicle.serviceRemainingSeconds=4;
  }
  private endService(vehicle:Vehicle):void {
    vehicle.currentFuelMl+=vehicle.deliveredMl;
    vehicle.tankIds=undefined;
    vehicle.reservedMl=0;vehicle.salePriceKopeks=0;vehicle.deliveredMl=0;vehicle.chargedKopeks=0;vehicle.costKopeks=0;
    vehicle.servicePhase=undefined;vehicle.phaseRemainingSeconds=0;
    const servedNode=vehicle.route.find(id=>/^pump_\d+$/.test(id))??'pump_1';
    const wants=vehicle.wantsShop||vehicle.wantsCafe;
    const free=vehicle.category==='truck'?(this.commerce.truckParking===undefined?TRUCK_PARKING_SLOT:-1):modelById(vehicle.modelId).length<=4.8?this.commerce.parking.indexOf(null):-1;
    if(wants&&free>=0){
      vehicle.parkSlot=free;
      if(free===TRUCK_PARKING_SLOT){
        this.commerce.truckParking=vehicle.id;
        this.setRoute(vehicle,['truck_parking_access','truck_parking'],'toParking');
      }else{
        this.commerce.parking[free]=vehicle.id;
        const route=[servedNode+'_depart',servedNode+'_clear',servedNode+'_merge'];
        if(NODES.get(servedNode+'_merge')!.x<795)route.push('exit_apron');
        this.setRoute(vehicle,[...route,'parking_entry',`parking_access_${free}`,`parking_${free}`],'toParking');
      }
      return;
    }
    if(wants&&free<0){vehicle.refusalReason='Нет места на парковке';this.commerce.venues.shop.lost+=Number(!!vehicle.wantsShop);this.commerce.venues.cafe.lost+=Number(!!vehicle.wantsCafe);}
    const route=vehicle.category==='truck'?[servedNode+'_truck_straight',servedNode+'_truck_turn',...TRUCK_EXIT_ROUTE]:[servedNode+'_depart',servedNode+'_clear',servedNode+'_merge',...EXIT_ROUTE];
    this.setRoute(vehicle,route,'leaving');
  }
  private startCustomer(id:number):void {const vehicle=this.vehicles.find(v=>v.id===id);if(!vehicle)return;const c=this.commerce;const plan=(['shop','cafe'] as Venue[]).filter(v=>v==='shop'?vehicle.wantsShop:vehicle.wantsCafe);plan.sort((a,b)=>{const wait=(v:Venue)=>{const state=c.venues[v];return (state.serving===undefined?0:state.serviceRemaining)+state.queue.length*VENUES[v].service*STAFF_SPEED[state.staffLevel-1];};return wait(a)-wait(b);});c.customers[id]={plan,patience:0,waiting:false};this.nextVenue(id);}
  private isOccupied(pump:Pump):boolean {
    return this.vehicles.some((vehicle)=>vehicle.pumpId===pump.id&&
      (vehicle.status==='toPump'||vehicle.status==='fueling'||vehicle.status==='finishing'||vehicle.status==='leaving'||vehicle.status==='toParking'));
  }
  private isReserved(pump:Pump):boolean {
    return this.isOccupied(pump)||this.queueIds.some(id=>this.vehicles.some(vehicle=>vehicle.id===id&&vehicle.pumpId===pump.id));
  }
  private isIslandBusy(pump:Pump):boolean {
    return this.vehicles.some(vehicle=>{
      const assigned=this.station.pumps.find(p=>p.id===vehicle.pumpId);
      return assigned&&Math.floor(assigned.slot/2)===Math.floor(pump.slot/2)&&
        ['toPump','leaving'].includes(vehicle.status);
    });
  }
  private dispatchQueue():void {
    for(const id of [...this.queueIds]) {
      const head=this.vehicles.find(v=>v.id===id);
      if(!head||head.status!=='queued')continue;
      const pump=this.station.pumps.find(p=>p.id===head.pumpId);
      if(!pump)continue;
      if(this.isOccupied(pump)||this.isIslandBusy(pump)||!this.usablePump(pump)||(this.station.jobs??[]).some(j=>j.kind==='rewire'&&j.targetId===pump.id))continue;
      const bay=pumpQueuePoint(pump.slot);
      // A departing car crosses the queue-bay approach on the shared exit
      // lane. Let it pass before releasing the next car from that bay.
      if(this.vehicles.some(other=>other.status==='leaving'&&other.y>=600&&other.y<=750&&
        other.x>bay.x-90&&other.x<bay.x+190))continue;
      if(this.vehicles.some(other=>other.id!==head.id&&other.status==='toPump'&&other.pumpId&&
        Number(other.pumpId.split('-')[1])-1<pump.slot&&other.y>=640&&other.y<800&&
        other.x>bay.x-100&&other.x<bay.x+200))continue;
      // The exit curve from the right side of one island crosses the approach
      // to the left side of the next island. Reserve that crossing until clear.
      if(this.vehicles.some(v=>{
        const current=this.station.pumps.find(p=>p.id===v.pumpId);
        return current&&Math.abs(current.slot-pump.slot)===1&&Math.max(current.slot,pump.slot)%2===0&&
          ['toPump','fueling','finishing','leaving'].includes(v.status);
      }))continue;
      if(!pump.fuels.includes(head.fuel)||this.unloadingFuel()===head.fuel||!this.station.tanks.some(t=>t.fuel===head.fuel&&this.usableTank(t)))continue;
      if(Math.hypot(head.x-assignedQueuePoint(head).x,head.y-assignedQueuePoint(head).y)>=5)continue;
      this.queueIds.splice(this.queueIds.indexOf(id),1);
      if(!this.reservePump(head,pump)){this.stats.unserved++;head.pumpId=undefined;this.setRoute(head,[`pump_${pump.slot+1}_bypass`,'bypass_west'],'leaving');continue;}
      this.setRoute(head,PUMP_ROUTES[pump.id]??PUMP_ROUTES['pump-1'],'toPump');
      break;
    }
  }
}
