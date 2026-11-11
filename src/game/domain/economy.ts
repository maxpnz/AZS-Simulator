import type { FuelTank, Pump } from './types';
export { SUPPLIERS, marketOffer as supplierOffer } from './market';

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
