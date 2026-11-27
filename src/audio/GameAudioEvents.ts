import type { GameState } from '../game/domain/types';
import { AudioManager } from './AudioManager';

/** Reads state transitions only. Rebase after loading a slot so old events stay silent. */
export class GameAudioEvents {
  private previous: GameState | undefined;
  private suppressNextUpdate = false;
  private lastWorkSound = 0;
  private trafficWait=new Map<number,{x:number;y:number;since:number;next:number}>();
  private lastHonk=0;
  constructor(private readonly audio: AudioManager) {}
  suppressNext(): void { this.suppressNextUpdate = true; }
  rebase(state: GameState): void { this.suppressNextUpdate = false; this.previous = state;this.lastWorkSound=0;this.trafficWait.clear(); this.audio.stopAllLoops?.();this.audio.startLoop('ambient_station','station');for(const vehicle of state.vehicles)if(vehicle.status==='fueling')this.audio.startLoop('pump_fueling',String(vehicle.id),vehicle);for(const trip of state.deliveries??[])if(trip.status==='unloading')this.audio.startLoop('fuel_unloading',trip.id,{x:1822,y:256});this.audio.syncEngineSounds?.(state.vehicles);this.audio.setGameTime(state.gameSeconds); }
  update(state: GameState): void {
    if (this.suppressNextUpdate) { this.rebase(state); return; }
    const old = this.previous;
    this.previous = state;
    this.audio.setGameTime(state.gameSeconds);
    this.audio.syncEngineSounds?.(state.vehicles);
    if (!old)return;
    const nowReal=performance.now();
    const seen=new Set<number>();
    for(const vehicle of state.vehicles){
      seen.add(vehicle.id);
      if(!['road','entering','toPump','leaving','toParking'].includes(vehicle.status)){this.trafficWait.delete(vehicle.id);continue;}
      const prior=this.trafficWait.get(vehicle.id);
      if(!prior||Math.hypot(vehicle.x-prior.x,vehicle.y-prior.y)>1){this.trafficWait.set(vehicle.id,{x:vehicle.x,y:vehicle.y,since:nowReal,next:nowReal+5000});continue;}
      if(nowReal>=prior.next&&nowReal-this.lastHonk>=1500){
        this.audio.play(vehicle.id%2?'vehicle_horn_1':'vehicle_horn_2',{gain:.45,position:vehicle});
        this.lastHonk=nowReal;prior.next=nowReal+10000+(vehicle.id*7919%10000);
      }
    }
    for(const id of this.trafficWait.keys())if(!seen.has(id))this.trafficWait.delete(id);
    if((state.financeEvents??[]).some(event=>event.kind==='goodsSale'&&!event.aggregated&&event.gameSeconds>old.gameSeconds))this.audio.play('cash_register',{gain:.7});
    const vehicles = new Map(old.vehicles.map(vehicle => [vehicle.id, vehicle]));
    for (const vehicle of state.vehicles) {
      const before = vehicles.get(vehicle.id);
      if (!before || before.status === vehicle.status) continue;
      if(vehicle.status==='toPump')this.audio.play('vehicle_pass',{gain:.45,position:vehicle});
      if(vehicle.status==='leaving'&&before.status==='finishing')this.audio.play('vehicle_start',{gain:.55,position:vehicle});
      if(vehicle.status==='parked')this.audio.play(vehicle.category==='truck'?'truck_brake':'vehicle_stop',{gain:.4,position:vehicle});
      if(vehicle.status==='leaving'&&before.status==='parked')this.audio.play('vehicle_start',{gain:.45,position:vehicle});
      if (vehicle.status === 'fueling') {
        this.audio.play('pump_nozzle_pickup', { gain: .8, position: vehicle });
        this.audio.startLoop('pump_fueling', String(vehicle.id), vehicle);
      }
      if (vehicle.status === 'finishing') {
        this.audio.stopLoop('pump_fueling', String(vehicle.id));
        this.audio.play('pump_complete', { gain: .8, position: vehicle });
      }
      if (before.status === 'finishing') this.audio.play('pump_nozzle_return', { gain: .7, position: vehicle });
    }
    for (const before of old.vehicles) if (!state.vehicles.some(vehicle => vehicle.id === before.id)) this.audio.stopLoop('pump_fueling', String(before.id));
    const activeJobs=(state.station.jobs??[]).filter(job=>job.status==='active');
    const workingRepair=state.technical?.tasks.some(task=>task.phase==='working');
    if((activeJobs.length||workingRepair)&&nowReal-this.lastWorkSound>=4000){
      this.lastWorkSound=nowReal;
      this.audio.play(workingRepair?'repair_tools':activeJobs.some(job=>job.kind.includes('upgrade'))?'repair_tools':'construction',{gain:.45});
    }
    for(const job of old.station.jobs??[])if(!(state.station.jobs??[]).some(next=>next.id===job.id))this.audio.play('upgrade_complete');
    const previousRepairs = new Set(old.technical?.history.map(record => record.id));
    for (const record of state.technical?.history ?? []) if (!previousRepairs.has(record.id)) this.audio.play('repair_complete');
    const oldNotice = old.technical?.noticeId;
    if (state.technical?.noticeId && state.technical.noticeId !== oldNotice && /слом|полом|критич|износ/i.test(state.technical.notice ?? '')) this.audio.play('ui_warning');
    const fuelTrips = new Map((old.deliveries ?? []).map(trip => [trip.id, trip.status]));
    for (const trip of state.deliveries ?? []) if (fuelTrips.has(trip.id) && fuelTrips.get(trip.id) !== trip.status) {
      if(trip.status==='approaching'){this.audio.play('ui_notification');this.audio.play('truck_arrival');}
      if(trip.status==='connecting')this.audio.play('pump_nozzle_pickup');
      if(trip.status==='unloading')this.audio.startLoop('fuel_unloading',trip.id,{x:1822,y:256});
      if(trip.status==='disconnecting'){this.audio.stopLoop('fuel_unloading',trip.id);this.audio.play('pump_complete');}
      if(trip.status==='leaving'){this.audio.stopLoop('fuel_unloading',trip.id);this.audio.play('vehicle_start');}
    }
    for(const trip of old.deliveries??[])if(!(state.deliveries??[]).some(next=>next.id===trip.id))this.audio.stopLoop('fuel_unloading',trip.id);
    const goodsOrders = new Map((old.commerce?.orders ?? []).map(order => [order.id, order.status]));
    for (const order of state.commerce?.orders ?? []) if (goodsOrders.has(order.id) && goodsOrders.get(order.id) !== order.status && order.status === 'delivered') {
      this.audio.play('ui_notification'); this.audio.play('goods_unloading');
    }
  }
}
