import type { FuelId, FuelStock, Pump, StationState, VehicleCategory } from './types';

export const MAX_PUMPS = 8;
export const MAX_FUELS_PER_PUMP = 3;
export const MAX_FUEL_TYPES_PER_TRIP = 3;
export const FUEL_IDS: readonly FuelId[] = ['ai92', 'ai95', 'ai95plus', 'ai98', 'ai100', 'diesel'];

const fuel = (id: FuelId, name: string, wholesaleKopeks: number, retailKopeks: number, baseDemand: number): FuelStock => ({
  id, name, wholesaleKopeks, retailKopeks, stockMl: 2_000_000, capacityMl: 10_000_000, baseDemand,
});

export const INITIAL_STATION: StationState = {
  balanceKopeks: 500_000_00,
  fuels: {
    ai92: fuel('ai92', 'АИ-92', 4900, 5700, 0.32),
    ai95: fuel('ai95', 'АИ-95', 5400, 6300, 0.43),
    ai95plus: fuel('ai95plus', 'АИ-95+', 5700, 6700, 0.12),
    ai98: fuel('ai98', 'АИ-98', 6200, 7300, 0.05),
    ai100: fuel('ai100', 'АИ-100', 6700, 7900, 0.03),
    diesel: fuel('diesel', 'ДТ', 5800, 6800, 0.05),
  },
  pumps: [
    { id: 'pump-1', slot: 0, fuels: ['ai92', 'ai95', 'diesel'] },
    { id: 'pump-2', slot: 1, fuels: ['ai95plus', 'ai98', 'ai100'] },
  ],
};

export const TRAFFIC_CONFIG = {
  seed: 0x41a25,
  spawnSlotSeconds: 90,
  baseSpawnChance: 0.4,
  baseVisitChance: 0.48,
  roadSpeed: 1.45,
  stationSpeed: 0.8,
  decisionX: 1.0,
  maxQueue: 6,
  serviceSetupSeconds: 90,
  fuelFlowMlPerSecond: 120,
  maxRecentSales: 5,
  categoryWeights: { compact: 0.19, sedan: 0.34, crossover: 0.19, suv: 0.10, van: 0.10, truck: 0.08 } satisfies Record<VehicleCategory, number>,
  category: {
    compact: { tankLitres: [35, 45], purchaseLitres: [12, 30], patienceMinutes: [5, 13] },
    sedan: { tankLitres: [45, 60], purchaseLitres: [15, 45], patienceMinutes: [6, 16] },
    crossover: { tankLitres: [55, 75], purchaseLitres: [20, 55], patienceMinutes: [7, 17] },
    suv: { tankLitres: [70, 100], purchaseLitres: [25, 70], patienceMinutes: [7, 18] },
    van: { tankLitres: [65, 90], purchaseLitres: [25, 65], patienceMinutes: [5, 14] },
    truck: { tankLitres: [200, 600], purchaseLitres: [80, 350], patienceMinutes: [8, 22] },
  } satisfies Record<VehicleCategory, { tankLitres: number[]; purchaseLitres: number[]; patienceMinutes: number[] }>,
  colors: [0x4eabe0, 0xe3bc52, 0xe56859, 0x83ca79, 0xc8b4e8, 0xe9eee1],
} as const;

export function cloneInitialStation(): StationState {
  return {
    balanceKopeks: INITIAL_STATION.balanceKopeks,
    fuels: Object.fromEntries(FUEL_IDS.map((id) => [id, { ...INITIAL_STATION.fuels[id] }])) as Record<FuelId, FuelStock>,
    pumps: INITIAL_STATION.pumps.map((pump) => ({ ...pump, fuels: [...pump.fuels] })),
  };
}

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
