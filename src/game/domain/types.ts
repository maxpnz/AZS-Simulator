export type FuelId = 'ai92' | 'ai95' | 'ai95plus' | 'ai98' | 'ai100' | 'diesel';

export interface FuelStock {
  id: FuelId;
  name: string;
  wholesaleKopeks: number;
  retailKopeks: number;
  stockMl: number;
  capacityMl: number;
  baseDemand: number;
}

export interface Pump {
  id: string;
  slot: number;
  fuels: FuelId[];
  status?: 'ready' | 'building' | 'upgrading';
  flowMultiplier?: number;
}

export interface FuelTank {
  id: string;
  fuel: FuelId;
  capacityMl: number;
  stockMl: number;
  status: 'active' | 'building' | 'upgrading';
}

export interface ConstructionJob {
  id: string; kind: 'pump' | 'pump-upgrade' | 'tank' | 'tank-upgrade' | 'rewire';
  targetId: string; totalSeconds: number; remainingSeconds: number; status: 'queued' | 'active';
  fuels?: FuelId[];
}

export interface StationState {
  balanceKopeks: number;
  fuels: Record<FuelId, FuelStock>;
  tanks: FuelTank[];
  pumps: Pump[];
  jobs?: ConstructionJob[];
}

export interface DeliveryTrip {
  id: string;
  cargo: Partial<Record<FuelId, number>>;
  arrivalGameSeconds: number;
  status?: 'enroute' | 'waiting' | 'approaching' | 'connecting' | 'unloading' | 'disconnecting' | 'leaving';
  phaseSeconds?: number;
  remainingMl?: number;
  totalMl?: number;
}

export type TimeSpeed = 1 | 2 | 5 | 10;

export interface ClockSnapshot {
  gameSeconds: number;
  day: number;
  hour: number;
  minute: number;
}

export type VehicleCategory = 'compact' | 'sedan' | 'crossover' | 'suv' | 'van' | 'truck';
export type VehicleStatus = 'road' | 'entering' | 'queued' | 'toPump' | 'fueling' | 'finishing' | 'leaving';
export type FillBehavior = 'full' | 'amount' | 'volume';

export interface Vehicle {
  id: number;
  category: VehicleCategory;
  modelId?: string;
  fuel: FuelId;
  tankCapacityMl: number;
  currentFuelMl: number;
  budgetKopeks: number;
  behavior: FillBehavior;
  requestedMl: number;
  patienceSeconds: number;
  waitedSeconds: number;
  status: VehicleStatus;
  pumpId?: string;
  reservedMl: number;
  salePriceKopeks: number;
  serviceRemainingSeconds: number;
  setupRemainingSeconds: number;
  deliveredMl: number;
  chargedKopeks: number;
  route: string[];
  laneId: string;
  x: number;
  y: number;
  angle: number;
  color: number;
  westbound: boolean;
  routeIndex: number;
  speed?: number;
}

export interface Sale {
  vehicleId: number;
  category: VehicleCategory;
  modelId?: string;
  fuel: FuelId;
  volumeMl: number;
  revenueKopeks: number;
  costKopeks: number;
  gameSeconds: number;
}

export interface TrafficStats {
  passed: number;
  visited: number;
  purchases: number;
  leftQueue: number;
  unserved: number;
  soldMl: number;
  revenueKopeks: number;
  costKopeks: number;
}

export interface GameState {
  gameSeconds: number;
  station: StationState;
  vehicles: Vehicle[];
  queueIds: number[];
  stats: TrafficStats;
  recentSales: Sale[];
  deliveries?: DeliveryTrip[];
}
