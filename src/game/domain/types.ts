export type FuelId = 'ai92' | 'ai95' | 'ai95plus' | 'ai98' | 'ai100' | 'diesel';

export interface FuelStock {
  id: FuelId;
  name: string;
  wholesaleKopeks: number;
  retailKopeks: number;
  litres: number;
  capacityLitres: number;
  baseDemand: number;
}

export interface Pump {
  id: string;
  slot: number;
  fuels: FuelId[];
}

export interface StationState {
  balanceKopeks: number;
  fuels: Record<FuelId, FuelStock>;
  pumps: Pump[];
}

export interface DeliveryTrip {
  id: string;
  cargo: Partial<Record<FuelId, number>>;
  arrivalGameSeconds: number;
}

export type TimeSpeed = 1 | 2 | 5 | 10;

export interface ClockSnapshot {
  gameSeconds: number;
  day: number;
  hour: number;
  minute: number;
}
