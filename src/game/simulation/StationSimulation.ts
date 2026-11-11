import { canPlacePump, cloneInitialStation, cloneLegacyStation, FUEL_IDS, isValidPumpFuels, TRAFFIC_CONFIG } from '../domain/config';
import { ROAD_NODES } from '../domain/roadNetwork';
import { PUMP_SLOTS } from '../domain/world';
import { deliveryPose } from '../domain/deliveryMotion';
import { footprintBlocked, sweptBlocked } from './collisions';
import { modelById } from '../domain/vehicleModels';
import { ECONOMY, levelTariff, pumpLevel, supplierOffer, SUPPLIERS, tankLevel } from '../domain/economy';
import type { ConstructionJob, DeliveryTrip, ExpenseTotals, FuelId, GameState, Pump, Sale, StationState, TrafficStats, Vehicle } from '../domain/types';
import { INITIAL_GAME_SECONDS } from './time';
import { createVehicle, passengerTrafficMultiplier, priceForVolume, purchaseLimitMl, RandomSource, truckTrafficMultiplier } from './traffic';

const NODES = new Map(ROAD_NODES.map((node) => [node.id, node]));
const EMPTY_STATS: TrafficStats = { passed: 0, visited: 0, purchases: 0, leftQueue: 0, unserved: 0, soldMl: 0, revenueKopeks: 0, costKopeks: 0 };
const EMPTY_EXPENSES: ExpenseTotals = {lightingKopeks:0,pumpElectricityKopeks:0,tankMaintenanceKopeks:0,pumpingKopeks:0,
  lightingRemainder:0,pumpRemainder:0,tankRemainder:0,pumpingRemainder:0,purchasesKopeks:0,capitalKopeks:0,
  stockValueKopeks:Object.fromEntries(FUEL_IDS.map(id=>[id,0])) as Record<FuelId,number>};
const PUMP_ROUTES: Record<string, string[]> = Object.fromEntries(PUMP_SLOTS.map(slot=>[
  `pump-${slot.slot+1}`,[`pump_${slot.slot+1}_approach`,`pump_${slot.slot+1}_turn`,`pump_${slot.slot+1}_align`,`pump_${slot.slot+1}`],
]));
const EXIT_ROUTE = ['exit_lane','exit','exit_merge','west_lane_1_west'];

function availableMl(station: StationState, vehicles: readonly Vehicle[], fuel: FuelId): number {
  const held = vehicles.reduce((sum, vehicle) =>
    sum + ((vehicle.status === 'toPump' || vehicle.status === 'fueling') && vehicle.fuel === fuel
      ? Math.max(0, vehicle.reservedMl - vehicle.deliveredMl) : 0), 0);
  const usable=station.tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.stockMl,0);
  return Math.max(0,usable-held);
}
function moveToward(vehicle: Vehicle, target: {x:number;y:number}, distance: number, others: readonly Vehicle[] = []): number {
  const dx=target.x-vehicle.x,dy=target.y-vehicle.y,length=Math.hypot(dx,dy);
  if(length<.0001)return distance;
  const desired=Math.atan2(dy,dx);
  const delta=Math.atan2(Math.sin(desired-vehicle.angle),Math.cos(desired-vehicle.angle));
  const maxStep=Math.min(distance,length);
  const candidate=(step:number)=>({x:vehicle.x+dx/length*step,y:vehicle.y+dy/length*step,
    angle:vehicle.angle+Math.max(-.14,Math.min(.14,delta))*(step/maxStep)});
  let step=maxStep,point=candidate(step);
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

export class StationSimulation {
  readonly station: StationState;
  readonly stats: TrafficStats = {...EMPTY_STATS};
  readonly vehicles: Vehicle[]=[];
  readonly queueIds: number[]=[];
  readonly recentSales: Sale[]=[];
  readonly deliveries: DeliveryTrip[]=[];
  readonly supplierReservedLitres: Record<string,number>={};
  readonly expenses: ExpenseTotals={...EMPTY_EXPENSES,stockValueKopeks:{...EMPTY_EXPENSES.stockValueKopeks}};
  private nextJobId=1;
  private nextDeliveryId=1;
  gameSeconds=INITIAL_GAME_SECONDS;
  private rng: RandomSource;
  private nextVehicleId=0;
  private nextSpawnSeconds=INITIAL_GAME_SECONDS;
  private finishedIds=new Set<number>();

  constructor(seed:number=TRAFFIC_CONFIG.seed,station:StationState=cloneInitialStation()) {
    this.rng=new RandomSource(seed);
    this.station=station;
    for(const id of FUEL_IDS)this.expenses.stockValueKopeks[id]=priceForVolume(station.fuels[id].stockMl,station.fuels[id].wholesaleKopeks);
  }
  snapshot(): GameState {
    return {
      gameSeconds:this.gameSeconds,
      station:{balanceKopeks:this.station.balanceKopeks,
        fuels:Object.fromEntries(Object.entries(this.station.fuels).map(([id,fuel])=>[id,{...fuel}])) as StationState['fuels'],
        pumps:this.station.pumps.map((pump)=>({...pump,fuels:[...pump.fuels]})),
        tanks:this.station.tanks.map((tank)=>({...tank})),jobs:(this.station.jobs??[]).map(job=>({...job,fuels:job.fuels?[...job.fuels]:undefined}))},
      vehicles:this.vehicles.map((vehicle)=>({...vehicle,route:[...vehicle.route]})),
      queueIds:[...this.queueIds],stats:{...this.stats},recentSales:this.recentSales.map((sale)=>({...sale})),
      deliveries:this.deliveries.map(trip=>({...trip,cargo:{...trip.cargo},remainingCargo:trip.remainingCargo?{...trip.remainingCargo}:undefined,
        unitPrices:trip.unitPrices?{...trip.unitPrices}:undefined,sections:trip.sections?.map(section=>({...section}))})),
      expenses:{...this.expenses,stockValueKopeks:{...this.expenses.stockValueKopeks}},
      supplierReservedLitres:{...this.supplierReservedLitres},
    };
  }
  exportSave() {
    return {version:'0.3.0',state:this.snapshot(),rngState:this.rng.getState(),nextVehicleId:this.nextVehicleId,
      nextSpawnSeconds:this.nextSpawnSeconds,nextJobId:this.nextJobId,nextDeliveryId:this.nextDeliveryId};
  }
  static importSave(raw:unknown):StationSimulation {
    if(!raw||typeof raw!=='object')throw new Error('Invalid save');
    const save=raw as {version?:string;state?:GameState;rngState?:number;nextVehicleId?:number;nextSpawnSeconds?:number;nextJobId?:number;nextDeliveryId?:number};
    const state=(save.state??raw) as GameState;
    if(!state.station||!Number.isFinite(state.gameSeconds))throw new Error('Invalid save state');
    const station=save.version==='0.2.8'||save.version==='0.3.0'?cloneInitialStation():cloneLegacyStation();
    if(Number.isFinite(state.station.balanceKopeks))station.balanceKopeks=state.station.balanceKopeks;
    for(const id of FUEL_IDS)if(state.station.fuels?.[id])station.fuels[id]={...station.fuels[id],...state.station.fuels[id]};
    station.tanks=(state.station.tanks??station.tanks).map(t=>({...t,status:t.status??'active'}));
    station.pumps=(state.station.pumps??station.pumps).filter(p=>Number.isInteger(p.slot)&&p.slot>=0&&p.slot<PUMP_SLOTS.length).map(p=>({...p,fuels:[...p.fuels],status:p.status??'ready',flowMultiplier:p.flowMultiplier??1,enabled:p.enabled??true}));
    station.jobs=(state.station.jobs??[]).map(j=>({...j,fuels:j.fuels?[...j.fuels]:undefined}));
    const sim=new StationSimulation(TRAFFIC_CONFIG.seed,station);
    sim.gameSeconds=state.gameSeconds;
    Object.assign(sim.stats,EMPTY_STATS,state.stats??{});
    sim.vehicles.push(...(state.vehicles??[]).map(v=>({...v,modelId:v.modelId??'budget-sedan',route:[...v.route]})));
    sim.queueIds.push(...(state.queueIds??[]).filter(id=>sim.vehicles.some(v=>v.id===id)));
    sim.recentSales.push(...(state.recentSales??[]).map(sale=>({...sale})));
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
    if(save.version!=='0.2.7'&&save.version!=='0.2.8'&&save.version!=='0.3.0')for(const v of sim.vehicles){
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
  private addJob(kind:ConstructionJob['kind'],targetId:string,duration:number,fuels?:FuelId[]):void {
    (this.station.jobs??=[]).push({id:`job-${this.nextJobId++}`,kind,targetId,totalSeconds:duration,remainingSeconds:duration,status:'queued',fuels});
  }
  buildPump(slot:number):boolean {
    if(!canPlacePump(this.station.pumps,slot)||this.station.balanceKopeks<2_500_000)return false;
    this.station.balanceKopeks-=2_500_000;
    this.expenses.capitalKopeks+=2_500_000;
    const fuels=(['ai92','ai95'] as FuelId[]).filter(fuel=>this.station.tanks.some(t=>t.fuel===fuel&&t.status==='active'));
    const pump:Pump={id:`pump-${slot+1}`,slot,fuels,status:'building',flowMultiplier:1,enabled:true};
    this.station.pumps.push(pump);this.addJob('pump',pump.id,360);return true;
  }
  upgradePump(id:string):boolean {
    const pump=this.station.pumps.find(p=>p.id===id);
    if(!pump||pump.status==='building'||pump.status==='upgrading'||this.isOccupied(pump)||this.station.balanceKopeks<1_200_000)return false;
    this.station.balanceKopeks-=1_200_000;this.expenses.capitalKopeks+=1_200_000;pump.status='upgrading';this.addJob('pump-upgrade',id,10_800);return true;
  }
  buildTank(fuel:FuelId):boolean {
    if(!FUEL_IDS.includes(fuel)||this.station.balanceKopeks<4_000_000)return false;
    this.station.balanceKopeks-=4_000_000;
    this.expenses.capitalKopeks+=4_000_000;
    const tank={id:`tank-${fuel}-${this.station.tanks.length+1}`,fuel,capacityMl:2_500_000,stockMl:0,status:'building' as const};
    this.station.tanks.push(tank);this.addJob('tank',tank.id,900);return true;
  }
  upgradeTank(id:string):boolean {
    const tank=this.station.tanks.find(t=>t.id===id);
    if(!tank||tank.status!=='active'||this.station.balanceKopeks<2_000_000||this.vehicles.some(v=>v.fuel===tank.fuel&&(v.status==='fueling'||v.status==='finishing'||v.status==='toPump')))return false;
    this.station.balanceKopeks-=2_000_000;this.expenses.capitalKopeks+=2_000_000;tank.status='upgrading';this.addJob('tank-upgrade',id,720);return true;
  }
  orderDelivery(fuel:FuelId,litres:number):boolean {
    if(!FUEL_IDS.includes(fuel)||!Number.isInteger(litres)||litres<=0||litres>20_000)return false;
    const ml=litres*1000,cost=litres*this.station.fuels[fuel].wholesaleKopeks;
    const pending=this.deliveries.reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
    const free=this.station.tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-pending;
    if(ml>free||cost>this.station.balanceKopeks)return false;
    this.station.balanceKopeks-=cost;this.expenses.purchasesKopeks+=cost;
    this.deliveries.push({id:`delivery-${this.nextDeliveryId++}`,cargo:{[fuel]:ml},remainingCargo:{[fuel]:ml},sections:[{fuel,totalMl:ml,remainingMl:ml}],unitPrices:{[fuel]:this.station.fuels[fuel].wholesaleKopeks},supplierId:'legacy',paidKopeks:cost,
      arrivalGameSeconds:this.gameSeconds+7200,status:'enroute',remainingMl:ml,totalMl:ml});
    return true;
  }
  getOffers(fuel:FuelId) {
    const day=Math.floor(this.gameSeconds/ECONOMY.gameDaySeconds);
    return SUPPLIERS.map(s=>{
      const offer=supplierOffer(s.id,fuel,this.gameSeconds,this.station.fuels[fuel].wholesaleKopeks)!;
      const reserved=this.supplierReservedLitres[`${day}:${s.id}:${fuel}`]??0;
      return {...offer,availableLitres:Math.max(0,offer.availableLitres-reserved)};
    });
  }
  orderTrip(supplierId:string,request:Partial<Record<FuelId,number>>|readonly {fuel:FuelId;litres:number}[]):boolean {
    const entries:[FuelId,number][]=Array.isArray(request)?request.map(section=>[section.fuel,section.litres]):Object.entries(request) as [FuelId,number][];
    if(entries.length<1||entries.length>3||entries.some(([fuel,litres])=>!FUEL_IDS.includes(fuel)||!Number.isInteger(litres)||litres<=0||litres>8_000)||
      entries.reduce((sum,[,litres])=>sum+litres,0)>24_000)return false;
    const totals=new Map<FuelId,number>();
    for(const [fuel,litres] of entries)totals.set(fuel,(totals.get(fuel)??0)+litres);
    let cost=0;const unitPrices:Partial<Record<FuelId,number>>={};
    for(const [fuel,litres] of totals){
      const offer=this.getOffers(fuel).find(o=>o.supplierId===supplierId);
      if(!offer||offer.availableLitres<litres)return false;
      const pending=this.deliveries.reduce((sum,trip)=>sum+(trip.remainingCargo?.[fuel]??trip.cargo[fuel]??0),0);
      const free=this.station.tanks.filter(t=>t.fuel===fuel&&t.status==='active').reduce((sum,t)=>sum+t.capacityMl-t.stockMl,0)-pending;
      if(litres*1000>free)return false;
      cost+=litres*offer.priceKopeks;
      unitPrices[fuel]=offer.priceKopeks;
    }
    if(cost>this.station.balanceKopeks)return false;
    const cargo=Object.fromEntries([...totals].map(([fuel,litres])=>[fuel,litres*1000])) as Partial<Record<FuelId,number>>;
    const sections=entries.map(([fuel,litres])=>({fuel,totalMl:litres*1000,remainingMl:litres*1000}));
    const totalMl=entries.reduce((sum,[,litres])=>sum+litres*1000,0);
    this.station.balanceKopeks-=cost;this.expenses.purchasesKopeks+=cost;
    const day=Math.floor(this.gameSeconds/ECONOMY.gameDaySeconds);
    for(const [fuel,litres] of totals){const key=`${day}:${supplierId}:${fuel}`;this.supplierReservedLitres[key]=(this.supplierReservedLitres[key]??0)+litres;}
    this.deliveries.push({id:`delivery-${this.nextDeliveryId++}`,cargo,remainingCargo:{...cargo},sections,unitPrices,supplierId,paidKopeks:cost,
      orderDay:day,
      arrivalGameSeconds:this.gameSeconds+(SUPPLIERS.find(s=>s.id===supplierId)?.etaGameSeconds??7200),status:'enroute',remainingMl:totalMl,totalMl});
    return true;
  }
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {
    const pump=this.station.pumps.find(candidate=>candidate.id===pumpId);
    if(!pump||pump.status==='building'||pump.status==='upgrading'||!isValidPumpFuels(fuels)||this.isOccupied(pump)||
      fuels.some(fuel=>!this.station.tanks.some(tank=>tank.fuel===fuel&&tank.status==='active')))return false;
    pump.status='upgrading';this.addJob('rewire',pumpId,180,[...fuels]);return true;
  }
  setPumpEnabled(pumpId:string,enabled:boolean):boolean {
    const pump=this.station.pumps.find(p=>p.id===pumpId);
    if(!pump||pump.status!=='ready'||(!enabled&&this.isOccupied(pump)))return false;
    pump.enabled=enabled;return true;
  }
  private advanceJobs(seconds:number):void {
    const jobs=this.station.jobs??[];
    let active=jobs.filter(job=>job.status==='active').length;
    for(const job of jobs)if(job.status==='queued'&&active<2){job.status='active';active++;}
    for(const job of [...jobs])if(job.status==='active'){
      job.remainingSeconds=Math.max(0,job.remainingSeconds-seconds);
      if(job.remainingSeconds>0)continue;
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
  }
  private deliveryVehicle(trip:DeliveryTrip):Vehicle {
    return {id:-1,modelId:'fuel-tanker',...deliveryPose(trip)} as Vehicle;
  }
  private trafficBlockers():Vehicle[] {
    const trip=this.deliveries.find(d=>d.status&&d.status!=='enroute'&&d.status!=='waiting');
    return trip?[...this.vehicles,this.deliveryVehicle(trip)]:this.vehicles;
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
    const tank=this.station.tanks.find(t=>t.fuel===fuel&&t.status==='active'&&t.stockMl<t.capacityMl);
    if(!tank)return;
    const actual=Math.min(section?.remainingMl??cargo[fuel]??0,tank.capacityMl-tank.stockMl,Math.floor(unloadSeconds*ECONOMY.unloadMlPerGameSecond));
    const original=active.cargo[fuel]??0;
    const previousDelivered=original-(cargo[fuel]??0);
    const unitPrice=active.unitPrices?.[fuel]??this.station.fuels[fuel].wholesaleKopeks;
    const value=priceForVolume(previousDelivered+actual,unitPrice)-priceForVolume(previousDelivered,unitPrice);
    this.expenses.stockValueKopeks[fuel]+=value;
    tank.stockMl+=actual;cargo[fuel]=(cargo[fuel]??0)-actual;if(section)section.remainingMl-=actual;
    active.remainingMl=Math.max(0,(active.remainingMl??0)-actual);
    this.recountFuel(fuel);
    if(active.remainingMl===0){active.status='disconnecting';active.phaseSeconds=0;}
  }
  step(seconds:number):void {
    if(!Number.isFinite(seconds)||seconds<=0) return;
    let remainingTime=seconds;
    while(remainingTime>0){
      this.advanceJobs(0);
      const nextCompletion=Math.min(...(this.station.jobs??[]).filter(job=>job.status==='active').map(job=>job.remainingSeconds),Infinity);
      const slice=Math.min(remainingTime,nextCompletion);
      this.accrueTimeExpenses(slice);
      this.gameSeconds+=slice;
      this.advanceJobs(slice);
      remainingTime-=slice;
    }
    this.advanceDeliveries(seconds);
    while(this.nextSpawnSeconds<=this.gameSeconds) {
      this.spawn(this.nextSpawnSeconds);
      this.nextSpawnSeconds+=TRAFFIC_CONFIG.spawnSlotSeconds;
    }
    this.finishedIds.clear();
    const ordered=[...this.vehicles].sort((a,b)=>{
      const priority=(v:Vehicle)=>v.status==='leaving'&&v.route[v.routeIndex]==='exit_lane'?2:v.status==='leaving'?1:0;
      return priority(b)-priority(a)||((a.westbound?-1:1)*(b.x-a.x));
    });
    for(const vehicle of ordered) this.advance(vehicle,seconds);
    this.dispatchQueue();
    for(let i=this.vehicles.length-1;i>=0;i--) if(this.finishedIds.has(this.vehicles[i].id)) this.vehicles.splice(i,1);
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
  private moveRoute(vehicle:Vehicle,distance:number):void {
    let remaining=distance,guard=0;
    while(remaining>0&&vehicle.routeIndex<vehicle.route.length&&guard++<12) {
      const id=vehicle.route[vehicle.routeIndex];
      const node=NODES.get(id);
      if(!node) throw new Error('Unknown road node '+id);
      if((node.x===0||node.x===2000)&&Math.hypot(vehicle.x-node.x,vehicle.y-node.y)<1){vehicle.routeIndex++;continue;}
      const blockers=this.trafficBlockers();
      // At the west exit a follower on the straight lane can pin the rear of
      // a car that has already begun turning. Let the lead car clear the bend.
      const movingBlockers=vehicle.status==='leaving'&&id==='exit'
        ?blockers.filter(other=>!(other.status==='leaving'&&other.x>vehicle.x+75&&Math.abs(other.y-700)<45))
        :blockers;
      remaining=moveToward(vehicle,node,remaining,movingBlockers);
      if(Math.hypot(vehicle.x-node.x,vehicle.y-node.y)<3) {
        if(vehicle.status==='leaving'&&id==='exit_lane'&&this.vehicles.some(other=>other.status==='road'&&other.laneId==='west_lane_1'&&other.x<500))return;
        vehicle.routeIndex++;
        if(vehicle.status==='leaving'&&id.endsWith('_clear'))vehicle.pumpId=undefined;
        if(vehicle.status==='road'&&id==='entrance_decision') this.decideVisit(vehicle);
      } else break;
    }
    if(vehicle.routeIndex>=vehicle.route.length) this.completeRoute(vehicle);
  }
  private completeRoute(vehicle:Vehicle):void {
    if(vehicle.status==='road') {this.stats.passed++;this.finishedIds.add(vehicle.id);}
    else if(vehicle.status==='entering') {
      vehicle.status='queued';vehicle.speed=0;vehicle.waitedSeconds=0;this.queueIds.push(vehicle.id);
    } else if(vehicle.status==='toPump') {
      vehicle.status='fueling';vehicle.speed=0;vehicle.setupRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds;
      vehicle.angle=Math.PI;
      vehicle.serviceRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds+
        vehicle.reservedMl/TRAFFIC_CONFIG.fuelFlowMlPerSecond;
    } else if(vehicle.status==='leaving') this.finishedIds.add(vehicle.id);
  }
  private decideVisit(vehicle:Vehicle):void {
    if(vehicle.laneId!=='west_lane_1'||this.rng.next()>=TRAFFIC_CONFIG.baseVisitChance) return;
    const compatible=this.station.pumps.some(pump=>pump.status==='ready'&&pump.enabled!==false&&pump.fuels.includes(vehicle.fuel)&&
      modelById(vehicle.modelId).length<=(pump.slot%2===1?4.7:5.4))&&this.station.tanks.some(t=>t.fuel===vehicle.fuel&&t.status==='active');
    if(!compatible||this.unloadingFuel()===vehicle.fuel||availableMl(this.station,this.vehicles,vehicle.fuel)<=0||
      this.queueIds.length+this.vehicles.filter((v)=>v.status==='entering').length>=TRAFFIC_CONFIG.maxQueue) {
      this.stats.unserved++;return;
    }
    this.stats.visited++;
    this.setRoute(vehicle,['entrance_curve','entrance'],'entering');
  }
  private travelDistance(vehicle:Vehicle,base:number,seconds:number):number {
    const model=modelById(vehicle.modelId);
    const accel=model.acceleration*.01,brake=model.braking*.01;
    const finalNode=vehicle.status==='queued'?queuePoint(Math.max(0,this.queueIds.indexOf(vehicle.id))):NODES.get(vehicle.route[vehicle.route.length-1]);
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
      if(vehicle.laneId==='west_lane_1'&&vehicle.x>1850&&this.vehicles.some(other=>other.status==='entering'&&other.id!==vehicle.id))
        travel=Math.min(travel,Math.max(0,vehicle.x-1980));
      if(vehicle.laneId==='west_lane_1'&&vehicle.x>=500&&this.vehicles.some(other=>other.status==='leaving'&&other.x<=350&&other.y<925))travel=Math.min(travel,Math.max(0,vehicle.x-500));
      if(travel>0)this.moveRoute(vehicle,travel);
    }
    else if(vehicle.status==='entering'||vehicle.status==='toPump'||vehicle.status==='leaving') {
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
        this.moveRoute(vehicle,travel);
      }
      else vehicle.speed=0;
    }
    else if(vehicle.status==='queued') {
      vehicle.waitedSeconds+=seconds;
      const index=this.queueIds.indexOf(vehicle.id);
      const bypassBusy=this.vehicles.some(other=>other.status==='leaving'&&!other.pumpId&&other.route.includes('queue_bypass')&&other.x>1350);
      const dispatchBusy=this.vehicles.some(other=>other.status==='toPump'&&other.x>1780&&other.y>650);
      if(index>=0&&!bypassBusy&&!dispatchBusy){
        const blockers=this.trafficBlockers().filter(other=>!(other.status==='entering'&&other.y>vehicle.y+35&&Math.abs(other.x-vehicle.x)<100));
        moveToward(vehicle,queuePoint(index),this.travelDistance(vehicle,TRAFFIC_CONFIG.stationSpeed,seconds),blockers);
      }
      if(index===0&&Math.hypot(vehicle.x-queuePoint(0).x,vehicle.y-queuePoint(0).y)<5&&
        vehicle.waitedSeconds>=vehicle.patienceSeconds&&
        !this.vehicles.some(other=>other.id!==vehicle.id&&other.status==='toPump'&&other.x<vehicle.x&&other.x>1280)&&
        !this.vehicles.some(other=>other.status==='leaving'&&other.pumpId&&other.route[other.routeIndex]?.endsWith('_depart')&&other.x>1100)) {
        if(index>=0) this.queueIds.splice(index,1);
        this.stats.leftQueue++;
        this.setRoute(vehicle,['queue_bypass_turn','queue_bypass',...EXIT_ROUTE],'leaving');
      }
    } else if(vehicle.status==='fueling')this.fuel(vehicle,seconds);
    else if(vehicle.status==='finishing'){vehicle.setupRemainingSeconds=Math.max(0,vehicle.setupRemainingSeconds-seconds);if(vehicle.setupRemainingSeconds===0)this.endService(vehicle);}
  }
  private fuel(vehicle:Vehicle,seconds:number):void {
    const setup=Math.min(seconds,vehicle.setupRemainingSeconds);
    vehicle.setupRemainingSeconds-=setup;
    const activeSeconds=seconds-setup;
    const stock=this.station.fuels[vehicle.fuel];
    const remaining=Math.max(0,vehicle.reservedMl-vehicle.deliveredMl);
    const pump=this.station.pumps.find(p=>p.id===vehicle.pumpId);
    const tank=this.station.tanks.find(candidate=>candidate.fuel===vehicle.fuel&&candidate.status==='active'&&candidate.stockMl>0);
    const delivered=Math.min(remaining,stock.stockMl,tank?.stockMl??0,Math.floor(activeSeconds*TRAFFIC_CONFIG.fuelFlowMlPerSecond*(pump?.flowMultiplier??1)));
    const stockBefore=stock.stockMl;
    const valueBefore=this.expenses.stockValueKopeks[vehicle.fuel];
    const cost=stockBefore>0?Math.min(valueBefore,Math.round(valueBefore*delivered/stockBefore)):0;
    vehicle.deliveredMl+=delivered;
    vehicle.costKopeks=(vehicle.costKopeks??0)+cost;
    this.expenses.stockValueKopeks[vehicle.fuel]-=cost;
    this.stats.costKopeks+=cost;
    stock.stockMl-=delivered;
    if(tank) tank.stockMl-=delivered;
    this.recountFuel(vehicle.fuel);
    this.stats.soldMl+=delivered;
    this.accruePumping(delivered);
    const totalCharge=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
    const charge=totalCharge-vehicle.chargedKopeks;
    vehicle.chargedKopeks=totalCharge;
    this.station.balanceKopeks+=charge;
    this.stats.revenueKopeks+=charge;
    vehicle.serviceRemainingSeconds=Math.max(0,vehicle.serviceRemainingSeconds-seconds);
    if(vehicle.deliveredMl>=vehicle.reservedMl||availableMl(this.station,[],vehicle.fuel)<=0)this.finishSale(vehicle);
  }
  private finishSale(vehicle:Vehicle):void {
    const stock=this.station.fuels[vehicle.fuel];
    if(vehicle.deliveredMl>0) {
      const revenueKopeks=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
      const costKopeks=vehicle.costKopeks??priceForVolume(vehicle.deliveredMl,stock.wholesaleKopeks);
      const sale:Sale={vehicleId:vehicle.id,category:vehicle.category,fuel:vehicle.fuel,
        volumeMl:vehicle.deliveredMl,revenueKopeks,costKopeks,gameSeconds:this.gameSeconds};
      this.recentSales.unshift(sale);
      this.recentSales.length=Math.min(this.recentSales.length,TRAFFIC_CONFIG.maxRecentSales);
      this.stats.purchases++;
    } else this.stats.unserved++;
    vehicle.status='finishing';vehicle.setupRemainingSeconds=30;vehicle.serviceRemainingSeconds=30;
  }
  private endService(vehicle:Vehicle):void {
    vehicle.currentFuelMl+=vehicle.deliveredMl;
    vehicle.reservedMl=0;vehicle.salePriceKopeks=0;vehicle.deliveredMl=0;vehicle.chargedKopeks=0;vehicle.costKopeks=0;
    const servedNode=vehicle.route.find(id=>/^pump_\d+$/.test(id))??'pump_1';
    this.setRoute(vehicle,[servedNode+'_depart',servedNode+'_clear',servedNode+'_merge',...EXIT_ROUTE],'leaving');
  }
  private isOccupied(pump:Pump):boolean {
    return this.vehicles.some((vehicle)=>vehicle.pumpId===pump.id&&
      (vehicle.status==='toPump'||vehicle.status==='fueling'||vehicle.status==='finishing'||vehicle.status==='leaving'));
  }
  private dispatchQueue():void {
    if(this.vehicles.some(v=>v.status==='leaving'&&v.route.includes('queue_bypass')&&v.x>1600))return;
    if(this.vehicles.some(v=>v.status==='leaving'&&v.pumpId&&v.route[v.routeIndex]?.endsWith('_depart')&&v.x>1100))return;
    if(this.vehicles.some(v=>v.status==='toPump'&&v.x>queuePoint(0).x-180))return;
    const offset=(this.queueIds[0]??0)%Math.max(1,this.station.pumps.length);
    const ordered=[...this.station.pumps].sort((a,b)=>
      (a.slot-offset+10)%10-(b.slot-offset+10)%10);
    for(const pump of ordered) {
      if(this.isOccupied(pump)||pump.status!=='ready'||pump.enabled===false)continue;
      // The exit curve from the right side of one island crosses the approach
      // to the left side of the next island. Reserve that crossing until clear.
      if(this.vehicles.some(v=>{
        const current=this.station.pumps.find(p=>p.id===v.pumpId);
        return current&&Math.abs(current.slot-pump.slot)===1&&Math.max(current.slot,pump.slot)%2===0&&
          ['toPump','fueling','finishing','leaving'].includes(v.status);
      }))continue;
      const id=this.queueIds[0],head=this.vehicles.find(candidate=>candidate.id===id);
      if(!head||!pump.fuels.includes(head.fuel)||this.unloadingFuel()===head.fuel||!this.station.tanks.some(t=>t.fuel===head.fuel&&t.status==='active')||
        modelById(head.modelId).length>(pump.slot%2===1?4.7:5.4)||availableMl(this.station,this.vehicles,head.fuel)<=0||
        Math.hypot(head.x-queuePoint(0).x,head.y-queuePoint(0).y)>=5)continue;
      this.queueIds.shift();
      const vehicle=this.vehicles.find((candidate)=>candidate.id===id)!;
      const stock=this.station.fuels[vehicle.fuel];
      vehicle.reservedMl=purchaseLimitMl(vehicle,stock.retailKopeks,availableMl(this.station,this.vehicles,vehicle.fuel));
      if(vehicle.reservedMl<=0) {this.stats.unserved++;this.setRoute(vehicle,['queue_bypass_turn','queue_bypass',...EXIT_ROUTE],'leaving');continue;}
      vehicle.salePriceKopeks=stock.retailKopeks;
      vehicle.deliveredMl=0;vehicle.costKopeks=0;vehicle.pumpId=pump.id;
      this.setRoute(vehicle,PUMP_ROUTES[pump.id]??PUMP_ROUTES['pump-1'],'toPump');
      break;
    }
  }
}
