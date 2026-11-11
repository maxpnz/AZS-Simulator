import type { FuelId, FuelTank, Pump } from './types';

export const ECONOMY = {
  lightingDailyKopeks: 50_000,
  pumpDailyKopeks: [12_000, 15_000, 19_500, 25_500],
  tankDailyKopeks: [8_000, 11_000, 14_500, 18_500],
  pumpingKopeksPerLitre: 15,
  gameDaySeconds: 86_400,
  unloadMlPerGameSecond: 600,
} as const;

export function pumpLevel(pump: Pump): number {
  return Math.max(1, Math.round(Math.log(pump.flowMultiplier ?? 1) / Math.log(1.5)) + 1);
}
export function tankLevel(tank: FuelTank): number {
  return Math.max(1, Math.round(tank.capacityMl / 2_500_000));
}
export function levelTariff(level: number, rates: readonly number[]): number {
  if (level <= rates.length) return rates[level - 1];
  // Continue the approved 2–4 progression without imposing a level cap.
  return rates[rates.length - 1] + (level - rates.length) * 6_000;
}

export interface Supplier {
  id: string;
  name: string;
  priceMultiplierBps: number;
  etaGameSeconds: number;
}
export const SUPPLIERS: readonly Supplier[] = [
  { id: 'regional', name: 'РегионНефть', priceMultiplierBps: 9_900, etaGameSeconds: 11 * 3600 },
  { id: 'union', name: 'Топливный союз', priceMultiplierBps: 10_000, etaGameSeconds: 6 * 3600 },
  { id: 'express', name: 'ЭкспрессОйл', priceMultiplierBps: 10_400, etaGameSeconds: 2 * 3600 },
];

export interface FuelOffer { supplierId: string; fuel: FuelId; priceKopeks: number; availableLitres: number; etaGameSeconds: number }
const FUEL_INDEX: readonly FuelId[] = ['ai92', 'ai95', 'ai95plus', 'ai98', 'ai100', 'diesel'];
export function supplierOffer(supplierId: string, fuel: FuelId, gameSeconds: number, baseKopeks: number): FuelOffer | undefined {
  const supplier = SUPPLIERS.find(item => item.id === supplierId);
  const index = FUEL_INDEX.indexOf(fuel);
  if (!supplier || index < 0) return undefined;
  const day = Math.floor(gameSeconds / ECONOMY.gameDaySeconds);
  const supplierIndex = SUPPLIERS.indexOf(supplier);
  const marketBps = 9_700 + ((day * 173 + index * 83 + 29) % 601);
  const availableLitres = (day + index * 2 + supplierIndex * 3 + 1) % 11 === 0 ? 0 : 8_000 + ((day * 7 + index * 5 + supplierIndex * 3) % 3) * 8_000;
  return { supplierId, fuel, priceKopeks: Math.round(baseKopeks * marketBps * supplier.priceMultiplierBps / 100_000_000), availableLitres, etaGameSeconds: supplier.etaGameSeconds };
}
