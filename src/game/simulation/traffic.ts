import { FUEL_IDS, TRAFFIC_CONFIG } from '../domain/config';
import type { FuelId, FillBehavior, Vehicle, VehicleCategory } from '../domain/types';
import { getHour, getTrafficMultiplier } from './time';

const CATEGORY_ORDER: readonly VehicleCategory[] = ['compact', 'sedan', 'crossover', 'suv', 'van', 'truck'];
const CAR_FUELS: readonly FuelId[] = ['ai92', 'ai95', 'ai95plus', 'ai98', 'ai100', 'diesel'];
const CAR_WEIGHTS = [0.32, 0.43, 0.12, 0.05, 0.03, 0.05];

/** Small deterministic generator; its state belongs to the simulation, never to Pixi. */
export class RandomSource {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 1; }
  next(): number {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  between(min: number, max: number): number { return min + this.next() * (max - min); }
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    let value = this.next() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < items.length; i++) { value -= weights[i]; if (value < 0) return items[i]; }
    return items[items.length - 1];
  }
}

/** Trucks keep a distinct, less volatile night profile. */
export function truckTrafficMultiplier(gameSeconds: number): number {
  const hour = getHour(gameSeconds);
  return 0.72 + 0.18 * Math.cos(((hour - 2) / 24) * 2 * Math.PI);
}

export function passengerTrafficMultiplier(gameSeconds: number): number { return getTrafficMultiplier(gameSeconds); }

export function chooseCategory(rng: RandomSource, gameSeconds: number): VehicleCategory {
  const weights = CATEGORY_ORDER.map((category) => TRAFFIC_CONFIG.categoryWeights[category] *
    (category === 'truck' ? truckTrafficMultiplier(gameSeconds) : passengerTrafficMultiplier(gameSeconds)));
  return rng.pickWeighted(CATEGORY_ORDER, weights);
}

export function chooseFuel(rng: RandomSource, category: VehicleCategory): FuelId {
  if (category === 'truck') return 'diesel';
  if (category === 'van') return rng.next() < 0.65 ? 'diesel' : 'ai95';
  if (category === 'suv') return rng.pickWeighted(CAR_FUELS, [0.08, 0.35, 0.22, 0.15, 0.1, 0.1]);
  return rng.pickWeighted(CAR_FUELS, CAR_WEIGHTS);
}

export function createVehicle(id: number, gameSeconds: number, rng: RandomSource): Vehicle {
  const category = chooseCategory(rng, gameSeconds);
  const fuel = chooseFuel(rng, category);
  const config = TRAFFIC_CONFIG.category[category];
  const tankCapacityMl = Math.round(rng.between(config.tankLitres[0], config.tankLitres[1]) * 1000);
  const currentFuelMl = Math.round(tankCapacityMl * rng.between(0.12, 0.55));
  const behavior = rng.pickWeighted<FillBehavior>(['full', 'amount', 'volume'], [0.45, 0.35, 0.2]);
  const typicalMl = Math.round(rng.between(config.purchaseLitres[0], config.purchaseLitres[1]) * 1000);
  const budgetKopeks = Math.round(typicalMl / 1000 * rng.between(85, 125) * 100);
  const westbound = rng.next() < 0.42;
  return {
    id, category, fuel, tankCapacityMl, currentFuelMl, budgetKopeks, behavior,
    requestedMl: behavior === 'full' ? tankCapacityMl - currentFuelMl : typicalMl,
    patienceSeconds: Math.round(rng.between(config.patienceMinutes[0], config.patienceMinutes[1]) * 60),
    waitedSeconds: 0, status: 'road', reservedMl: 0, salePriceKopeks: 0, serviceRemainingSeconds: 0, setupRemainingSeconds: 0, deliveredMl: 0, route: [], laneId: '',
    x: 0, y: 0, angle: 0,
    color: TRAFFIC_CONFIG.colors[id % TRAFFIC_CONFIG.colors.length], westbound, routeIndex: 0,
  };
}

/** Money is charged for actual delivered millilitres, once when service finishes. */
export function priceForVolume(volumeMl: number, priceKopeksPerLitre: number): number {
  return Math.round(volumeMl * priceKopeksPerLitre / 1000);
}

export function purchaseLimitMl(vehicle: Vehicle, retailKopeks: number, availableMl: number): number {
  if (retailKopeks <= 0 || availableMl <= 0) return 0;
  const tankRoom = Math.max(0, vehicle.tankCapacityMl - vehicle.currentFuelMl);
  const affordable = Math.floor(vehicle.budgetKopeks * 1000 / retailKopeks);
  const desired = vehicle.behavior === 'amount' ? affordable : vehicle.requestedMl;
  return Math.max(0, Math.floor(Math.min(desired, tankRoom, affordable, availableMl)));
}

export function isKnownFuel(id: string): id is FuelId { return FUEL_IDS.includes(id as FuelId); }
