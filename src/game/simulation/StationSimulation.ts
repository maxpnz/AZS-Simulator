import { cloneInitialStation, isValidPumpFuels, TRAFFIC_CONFIG } from '../domain/config';
import { ROAD_NODES } from '../domain/roadNetwork';
import type { FuelId, GameState, Pump, Sale, StationState, TrafficStats, Vehicle } from '../domain/types';
import { INITIAL_GAME_SECONDS } from './time';
import { createVehicle, passengerTrafficMultiplier, priceForVolume, purchaseLimitMl, RandomSource, truckTrafficMultiplier } from './traffic';

const NODES = new Map(ROAD_NODES.map((node) => [node.id, node]));
const EMPTY_STATS: TrafficStats = { passed: 0, visited: 0, purchases: 0, leftQueue: 0, unserved: 0, soldMl: 0, revenueKopeks: 0, costKopeks: 0 };
const PUMP_ROUTES: Record<string, [string,string]> = {
  'pump-1': ['pump_1_approach','pump_1'],
  'pump-2': ['pump_2_approach','pump_2'],
};
const EXIT_ROUTE = ['exit_lane','exit','exit_merge','east_lane_1_east'];

function availableMl(station: StationState, vehicles: readonly Vehicle[], fuel: FuelId): number {
  const held = vehicles.reduce((sum, vehicle) =>
    sum + ((vehicle.status === 'toPump' || vehicle.status === 'fueling') && vehicle.fuel === fuel
      ? Math.max(0, vehicle.reservedMl - vehicle.deliveredMl) : 0), 0);
  return Math.max(0, station.fuels[fuel].stockMl - held);
}
function moveToward(vehicle: Vehicle, target: {x:number;y:number}, distance: number): number {
  const dx=target.x-vehicle.x, dy=target.y-vehicle.y;
  const length=Math.hypot(dx,dy);
  if(length<.0001) return distance;
  const step=Math.min(distance,length);
  vehicle.x+=dx/length*step; vehicle.y+=dy/length*step;
  vehicle.angle=Math.atan2(dy,dx);
  return distance-step;
}
function queuePoint(index:number): {x:number;y:number} {
  return {x:610-index*75,y:648};
}

export class StationSimulation {
  readonly station: StationState;
  readonly stats: TrafficStats = {...EMPTY_STATS};
  readonly vehicles: Vehicle[]=[];
  readonly queueIds: number[]=[];
  readonly recentSales: Sale[]=[];
  gameSeconds=INITIAL_GAME_SECONDS;
  private rng: RandomSource;
  private nextVehicleId=0;
  private nextSpawnSeconds=INITIAL_GAME_SECONDS;
  private finishedIds=new Set<number>();

  constructor(seed:number=TRAFFIC_CONFIG.seed,station:StationState=cloneInitialStation()) {
    this.rng=new RandomSource(seed);
    this.station=station;
  }
  snapshot(): GameState {
    return {
      gameSeconds:this.gameSeconds,
      station:{balanceKopeks:this.station.balanceKopeks,
        fuels:Object.fromEntries(Object.entries(this.station.fuels).map(([id,fuel])=>[id,{...fuel}])) as StationState['fuels'],
        pumps:this.station.pumps.map((pump)=>({...pump,fuels:[...pump.fuels]})),
        tanks:this.station.tanks.map((tank)=>({...tank}))},
      vehicles:this.vehicles.map((vehicle)=>({...vehicle,route:[...vehicle.route]})),
      queueIds:[...this.queueIds],stats:{...this.stats},recentSales:this.recentSales.map((sale)=>({...sale})),
    };
  }
  setRetailPrice(fuel:FuelId,kopeks:number):boolean {
    if(!Number.isInteger(kopeks)||kopeks<100||kopeks>99900) return false;
    this.station.fuels[fuel].retailKopeks=kopeks;
    return true;
  }
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {
    const pump=this.station.pumps.find((candidate)=>candidate.id===pumpId);
    if(!pump||!isValidPumpFuels(fuels)||this.isOccupied(pump)||
      fuels.some((fuel)=>!this.station.tanks.some((tank)=>tank.fuel===fuel&&tank.status==='active'))) return false;
    pump.fuels=[...fuels];
    return true;
  }
  step(seconds:number):void {
    if(!Number.isFinite(seconds)||seconds<=0) return;
    this.gameSeconds+=seconds;
    while(this.nextSpawnSeconds<=this.gameSeconds) {
      this.spawn(this.nextSpawnSeconds);
      this.nextSpawnSeconds+=TRAFFIC_CONFIG.spawnSlotSeconds;
    }
    this.finishedIds.clear();
    for(const vehicle of this.vehicles) this.advance(vehicle,seconds);
    this.dispatchQueue();
    for(let i=this.vehicles.length-1;i>=0;i--) if(this.finishedIds.has(this.vehicles[i].id)) this.vehicles.splice(i,1);
  }
  private spawn(atSeconds:number):void {
    const vehicle=createVehicle(this.nextVehicleId++,atSeconds,this.rng);
    const profile=vehicle.category==='truck'?truckTrafficMultiplier(atSeconds):passengerTrafficMultiplier(atSeconds);
    if(this.rng.next()>=Math.min(.95,TRAFFIC_CONFIG.baseSpawnChance*profile)) return;
    const lane=this.rng.pickWeighted(
      ['east_lane_1','east_lane_2','west_lane_1','west_lane_2'] as const,[.42,.16,.21,.21]);
    vehicle.laneId=lane;
    vehicle.westbound=lane.startsWith('west');
    const start=NODES.get(lane+(vehicle.westbound?'_east':'_west'))!;
    vehicle.x=start.x;vehicle.y=start.y;vehicle.angle=vehicle.westbound?Math.PI:0;
    vehicle.route=vehicle.westbound?[lane+'_west'] : lane==='east_lane_1'
      ? ['entrance_decision','east_lane_1_east']:[lane+'_east'];
    vehicle.routeIndex=0;
    this.vehicles.push(vehicle);
  }
  private setRoute(vehicle:Vehicle,route:readonly string[],status:Vehicle['status']):void {
    vehicle.route=[...route];vehicle.routeIndex=0;vehicle.status=status;
  }
  private moveRoute(vehicle:Vehicle,distance:number):void {
    let remaining=distance,guard=0;
    while(remaining>0&&vehicle.routeIndex<vehicle.route.length&&guard++<12) {
      const id=vehicle.route[vehicle.routeIndex];
      const node=NODES.get(id);
      if(!node) throw new Error('Unknown road node '+id);
      const before=remaining;
      remaining=moveToward(vehicle,node,remaining);
      if(before===remaining||Math.hypot(vehicle.x-node.x,vehicle.y-node.y)<.001) {
        vehicle.routeIndex++;
        if(vehicle.status==='road'&&id==='entrance_decision') this.decideVisit(vehicle);
      } else break;
    }
    if(vehicle.routeIndex>=vehicle.route.length) this.completeRoute(vehicle);
  }
  private completeRoute(vehicle:Vehicle):void {
    if(vehicle.status==='road') {this.stats.passed++;this.finishedIds.add(vehicle.id);}
    else if(vehicle.status==='entering') {
      vehicle.status='queued';vehicle.waitedSeconds=0;this.queueIds.push(vehicle.id);
    } else if(vehicle.status==='toPump') {
      vehicle.status='fueling';vehicle.setupRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds;
      vehicle.angle=0;
      vehicle.serviceRemainingSeconds=TRAFFIC_CONFIG.serviceSetupSeconds+
        vehicle.reservedMl/TRAFFIC_CONFIG.fuelFlowMlPerSecond;
    } else if(vehicle.status==='leaving') this.finishedIds.add(vehicle.id);
  }
  private decideVisit(vehicle:Vehicle):void {
    if(vehicle.laneId!=='east_lane_1'||this.rng.next()>=TRAFFIC_CONFIG.baseVisitChance) return;
    const compatible=this.station.pumps.some((pump)=>pump.fuels.includes(vehicle.fuel));
    if(!compatible||availableMl(this.station,this.vehicles,vehicle.fuel)<=0||
      this.queueIds.length+this.vehicles.filter((v)=>v.status==='entering').length>=TRAFFIC_CONFIG.maxQueue) {
      this.stats.unserved++;return;
    }
    this.stats.visited++;
    this.setRoute(vehicle,['entrance_curve','entrance'],'entering');
  }
  private advance(vehicle:Vehicle,seconds:number):void {
    if(vehicle.status==='road') this.moveRoute(vehicle,TRAFFIC_CONFIG.roadSpeed*seconds);
    else if(vehicle.status==='entering'||vehicle.status==='toPump'||vehicle.status==='leaving')
      this.moveRoute(vehicle,TRAFFIC_CONFIG.stationSpeed*seconds);
    else if(vehicle.status==='queued') {
      vehicle.waitedSeconds+=seconds;
      const index=this.queueIds.indexOf(vehicle.id);
      if(index>=0) moveToward(vehicle,queuePoint(index),TRAFFIC_CONFIG.stationSpeed*seconds);
      if(vehicle.waitedSeconds>=vehicle.patienceSeconds) {
        if(index>=0) this.queueIds.splice(index,1);
        this.stats.leftQueue++;
        this.setRoute(vehicle,EXIT_ROUTE,'leaving');
      }
    } else if(vehicle.status==='fueling') this.fuel(vehicle,seconds);
  }
  private fuel(vehicle:Vehicle,seconds:number):void {
    const setup=Math.min(seconds,vehicle.setupRemainingSeconds);
    vehicle.setupRemainingSeconds-=setup;
    const activeSeconds=seconds-setup;
    const stock=this.station.fuels[vehicle.fuel];
    const remaining=Math.max(0,vehicle.reservedMl-vehicle.deliveredMl);
    const delivered=Math.min(remaining,stock.stockMl,Math.floor(activeSeconds*TRAFFIC_CONFIG.fuelFlowMlPerSecond));
    vehicle.deliveredMl+=delivered;
    stock.stockMl-=delivered;
    const tank=this.station.tanks.find((candidate)=>candidate.fuel===vehicle.fuel);
    if(tank) tank.stockMl-=delivered;
    this.stats.soldMl+=delivered;
    const totalCharge=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
    const charge=totalCharge-vehicle.chargedKopeks;
    vehicle.chargedKopeks=totalCharge;
    this.station.balanceKopeks+=charge;
    this.stats.revenueKopeks+=charge;
    vehicle.serviceRemainingSeconds=Math.max(0,vehicle.serviceRemainingSeconds-seconds);
    if(vehicle.deliveredMl>=vehicle.reservedMl||stock.stockMl<=0) this.finishSale(vehicle);
  }
  private finishSale(vehicle:Vehicle):void {
    const stock=this.station.fuels[vehicle.fuel];
    if(vehicle.deliveredMl>0) {
      const revenueKopeks=priceForVolume(vehicle.deliveredMl,vehicle.salePriceKopeks);
      const costKopeks=priceForVolume(vehicle.deliveredMl,stock.wholesaleKopeks);
      vehicle.currentFuelMl+=vehicle.deliveredMl;
      const sale:Sale={vehicleId:vehicle.id,category:vehicle.category,fuel:vehicle.fuel,
        volumeMl:vehicle.deliveredMl,revenueKopeks,costKopeks,gameSeconds:this.gameSeconds};
      this.recentSales.unshift(sale);
      this.recentSales.length=Math.min(this.recentSales.length,TRAFFIC_CONFIG.maxRecentSales);
      this.stats.purchases++;this.stats.costKopeks+=costKopeks;
    } else this.stats.unserved++;
    vehicle.reservedMl=0;
    vehicle.salePriceKopeks=0;
    vehicle.deliveredMl=0;
    vehicle.chargedKopeks=0;
    vehicle.pumpId=undefined;
    const departure=vehicle.route.includes('pump_1')?'pump_1_depart':'pump_2_depart';
    this.setRoute(vehicle,[departure,...EXIT_ROUTE],'leaving');
  }
  private isOccupied(pump:Pump):boolean {
    return this.vehicles.some((vehicle)=>vehicle.pumpId===pump.id&&
      (vehicle.status==='toPump'||vehicle.status==='fueling'));
  }
  private dispatchQueue():void {
    for(const pump of this.station.pumps) {
      if(this.isOccupied(pump)) continue;
      const index=this.queueIds.findIndex((id)=>{
        const vehicle=this.vehicles.find((candidate)=>candidate.id===id);
        return vehicle&&pump.fuels.includes(vehicle.fuel)&&availableMl(this.station,this.vehicles,vehicle.fuel)>0&&
          Math.hypot(vehicle.x-queuePoint(this.queueIds.indexOf(id)).x,vehicle.y-queuePoint(this.queueIds.indexOf(id)).y)<5;
      });
      if(index<0) continue;
      const id=this.queueIds.splice(index,1)[0];
      const vehicle=this.vehicles.find((candidate)=>candidate.id===id)!;
      const stock=this.station.fuels[vehicle.fuel];
      vehicle.reservedMl=purchaseLimitMl(vehicle,stock.retailKopeks,availableMl(this.station,this.vehicles,vehicle.fuel));
      if(vehicle.reservedMl<=0) {this.stats.unserved++;this.setRoute(vehicle,EXIT_ROUTE,'leaving');continue;}
      vehicle.salePriceKopeks=stock.retailKopeks;
      vehicle.deliveredMl=0;vehicle.pumpId=pump.id;
      this.setRoute(vehicle,PUMP_ROUTES[pump.id]??PUMP_ROUTES['pump-1'],'toPump');
    }
  }
}
