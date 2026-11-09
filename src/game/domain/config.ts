import type { FuelId, FuelStock, Pump, StationState } from './types';

export const MAX_PUMPS = 8;
export const MAX_FUELS_PER_PUMP = 3;
export const MAX_FUEL_TYPES_PER_TRIP = 3;

export const FUEL_IDS: readonly FuelId[] = ['ai92', 'ai95', 'ai95plus', 'ai98', 'ai100', 'diesel'];

const fuel = (id: FuelId, name: string, wholesaleKopeks: number, retailKopeks: number, baseDemand: number): FuelStock => ({
  id, name, wholesaleKopeks, retailKopeks, litres: 4000, capacityLitres: 12000, baseDemand,
});

export const INITIAL_STATION: StationState = {
  balanceKopeks: 2_500_000_00,
  fuels: {
    ai92: fuel('ai92', 'АИ-92', 4350, 5190, 0.8),
    ai95: fuel('ai95', 'АИ-95', 4800, 5790, 1),
    ai95plus: fuel('ai95plus', 'АИ-95+', 5100, 6190, 0.45),
    ai98: fuel('ai98', 'АИ-98', 5750, 6890, 0.3),
    ai100: fuel('ai100', 'АИ-100', 6500, 7690, 0.2),
    diesel: fuel('diesel', 'ДТ', 4950, 5950, 0.7),
  },
  pumps: [
    { id: 'pump-1', slot: 0, fuels: ['ai92', 'ai95', 'diesel'] },
    { id: 'pump-2', slot: 1, fuels: ['ai95', 'ai95plus', 'diesel'] },
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
