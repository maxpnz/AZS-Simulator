import type { FuelId, FuelStock, Pump, StationState } from './types';

export const MAX_PUMPS = 8;
export const MAX_FUELS_PER_PUMP = 3;
export const MAX_FUEL_TYPES_PER_TRIP = 3;

export const FUEL_IDS: readonly FuelId[] = ['ai92', 'ai95', 'ai95plus', 'ai98', 'ai100', 'diesel'];

const fuel = (id: FuelId, name: string, wholesaleKopeks: number, retailKopeks: number, baseDemand: number, litres: number): FuelStock => ({
  id, name, wholesaleKopeks, retailKopeks, litres, capacityLitres: 10000, baseDemand,
});

export const INITIAL_STATION: StationState = {
  balanceKopeks: 500_000_00,
  fuels: {
    ai92: fuel('ai92', 'АИ-92', 4900, 5700, 0.32, 2000),
    ai95: fuel('ai95', 'АИ-95', 5400, 6300, 0.43, 2000),
    ai95plus: fuel('ai95plus', 'АИ-95+', 5700, 6700, 0.12, 2000),
    ai98: fuel('ai98', 'АИ-98', 6200, 7300, 0.05, 2000),
    ai100: fuel('ai100', 'АИ-100', 6700, 7900, 0.03, 2000),
    diesel: fuel('diesel', 'ДТ', 5800, 6800, 0.05, 2000),
  },
  pumps: [
    { id: 'pump-1', slot: 0, fuels: ['ai92', 'ai95', 'diesel'] },
    { id: 'pump-2', slot: 1, fuels: ['ai95plus', 'ai98', 'ai100'] },
  ],
};

export function canPlacePump(pumps: readonly Pump[], slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < MAX_PUMPS && pumps.length < MAX_PUMPS && !pumps.some((pump) => pump.slot === slot);
}

export function isValidPumpFuels(fuels: readonly FuelId[]): boolean {
  return fuels.length > 0 && fuels.length <= MAX_FUELS_PER_PUMP && new Set(fuels).size === fuels.length && fuels.every((id) => FUEL_IDS.includes(id));
}

export function isValidDeliveryCargo(cargo: Partial<Record<FuelId, number>>): boolean {
  const entries = Object.entries(cargo);
  return entries.length > 0 && entries.length <= MAX_FUEL_TYPES_PER_TRIP && entries.every(([id, litres]) =>
    FUEL_IDS.includes(id as FuelId) && typeof litres === 'number' && Number.isFinite(litres) && litres > 0,
  );
}
