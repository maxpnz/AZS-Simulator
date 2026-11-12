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
  enabled?: boolean;
  lastDisplayMl?: number;
  lastDisplayKopeks?: number;
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
  remainingCargo?: Partial<Record<FuelId, number>>;
  supplierId?: string;
  paidKopeks?: number;
  orderDay?: number;
  unitPrices?: Partial<Record<FuelId, number>>;
  sections?: { fuel: FuelId; totalMl: number; remainingMl: number }[];
}

export interface ExpenseTotals {
  lightingKopeks: number;
  pumpElectricityKopeks: number;
  tankMaintenanceKopeks: number;
  pumpingKopeks: number;
  /** Fractions of a kopek, retained across saves. */
  lightingRemainder: number;
  pumpRemainder: number;
  tankRemainder: number;
  pumpingRemainder: number;
  purchasesKopeks: number;
  capitalKopeks: number;
  stockValueKopeks: Record<FuelId, number>;
}

export type FinanceKind = 'sale' | 'lighting' | 'pumpElectricity' | 'tankMaintenance' | 'pumping' | 'purchase' | 'construction' | 'upgrade';
export interface FinanceEvent {
  gameSeconds: number;
  kind: FinanceKind;
  amountKopeks: number;
  costKopeks?: number;
  fuel?: FuelId;
  volumeMl?: number;
  objectId?: string;
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
  costKopeks?: number;
  route: string[];
  laneId: string;
  x: number;
  y: number;
  angle: number;
  color: number;
  westbound: boolean;
  routeIndex: number;
  speed?: number;
  refusalReason?: string;
  servicePhase?: 'exiting'|'toBuilding'|'paying'|'returning'|'preparing'|'dispensing'|'boarding';
  phaseRemainingSeconds?: number;
  driverVariant?: number;
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
  expenses?: ExpenseTotals;
  supplierReservedLitres?: Record<string, number>;
  market?: import('./market').MarketState;
  competition?: import('./competitors').CompetitionState;
  financeEvents?: FinanceEvent[];
}
