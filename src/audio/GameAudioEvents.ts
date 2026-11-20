import type { GameState } from '../game/domain/types';
import { AudioManager } from './AudioManager';

/** Reads state transitions only. Rebase after loading a slot so old events stay silent. */
export class GameAudioEvents {
  private previous: GameState | undefined;
  private suppressNextUpdate = false;
  constructor(private readonly audio: AudioManager) {}
  suppressNext(): void { this.suppressNextUpdate = true; }
  rebase(state: GameState): void { this.suppressNextUpdate = false; this.previous = state; this.audio.setGameTime(state.gameSeconds); }
  update(state: GameState): void {
    if (this.suppressNextUpdate) { this.rebase(state); return; }
    const old = this.previous;
    this.previous = state;
    this.audio.setGameTime(state.gameSeconds);
    if (!old) return;
    const vehicles = new Map(old.vehicles.map(vehicle => [vehicle.id, vehicle]));
    for (const vehicle of state.vehicles) {
      const before = vehicles.get(vehicle.id);
      if (!before || before.status === vehicle.status) continue;
      if (vehicle.status === 'fueling') {
        this.audio.play('pump_nozzle_pickup', { gain: .8, position: vehicle });
        this.audio.startLoop('pump_fueling', String(vehicle.id));
      }
      if (vehicle.status === 'finishing') {
        this.audio.stopLoop('pump_fueling', String(vehicle.id));
        this.audio.play('pump_complete', { gain: .8, position: vehicle });
      }
      if (before.status === 'finishing') this.audio.play('pump_nozzle_return', { gain: .7, position: vehicle });
    }
    for (const before of old.vehicles) if (!state.vehicles.some(vehicle => vehicle.id === before.id)) this.audio.stopLoop('pump_fueling', String(before.id));
    const previousRepairs = new Set(old.technical?.history.map(record => record.id));
    for (const record of state.technical?.history ?? []) if (!previousRepairs.has(record.id)) this.audio.play('repair_complete');
    const oldNotice = old.technical?.noticeId;
    if (state.technical?.noticeId && state.technical.noticeId !== oldNotice && /слом|полом|критич|износ/i.test(state.technical.notice ?? '')) this.audio.play('ui_warning');
    const fuelTrips = new Map((old.deliveries ?? []).map(trip => [trip.id, trip.status]));
    for (const trip of state.deliveries ?? []) if (fuelTrips.has(trip.id) && fuelTrips.get(trip.id) !== trip.status && trip.status === 'approaching') {
      this.audio.play('ui_notification'); this.audio.play('truck_arrival');
    }
    const goodsOrders = new Map((old.commerce?.orders ?? []).map(order => [order.id, order.status]));
    for (const order of state.commerce?.orders ?? []) if (goodsOrders.has(order.id) && goodsOrders.get(order.id) !== order.status && order.status === 'delivered') {
      this.audio.play('ui_notification'); this.audio.play('goods_unloading');
    }
    if ((state.commerce?.venues.shop.revenueKopeks ?? 0) > (old.commerce?.venues.shop.revenueKopeks ?? 0) ||
        (state.commerce?.venues.cafe.revenueKopeks ?? 0) > (old.commerce?.venues.cafe.revenueKopeks ?? 0)) this.audio.play('cash_register');
  }
}
