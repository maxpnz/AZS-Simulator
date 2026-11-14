import type { FuelTank, Pump } from './types';

export type EquipmentKind = 'pump' | 'tank';
export type RepairPhase = 'travel' | 'waiting' | 'working' | 'departing';
export type AutomationMode = 'automatic' | 'critical' | 'manual';
export interface Technician {
  id: string; name: string; level: number; phase: 'inside' | 'travel' | 'waiting' | 'working' | 'returning' | 'training';
  x: number; y: number; phaseRemaining: number; trainingRemaining: number; trainingTarget?: number;
  salaryRemainder: number; salarySeconds: number; salaryAccrualNumerator?:number;
  returnStartX?: number; returnStartY?: number;
}
export interface RepairTask {
  id: string; equipmentId: string; kind: EquipmentKind; technicianId?: string; contractor?: 'budget' | 'standard' | 'urgent';
  source: 'manual' | 'automatic'; phase: RepairPhase; phaseRemaining: number; paid: boolean;
  partsKopeks: number; callKopeks: number; conditionBefore: number; durationSeconds: number;
  executorName: string; paymentEventId?: string; startedAt?: number;
  blocked?: boolean;
  startX?:number;startY?:number;
  parkingSlot?:number;
}
export interface RepairRecord {
  id: string; gameSeconds: number; equipmentId: string; kind: EquipmentKind; conditionBefore: number;
  partsKopeks: number; callKopeks: number; durationSeconds: number; executorName: string;
  technicianId?: string; source: 'manual' | 'automatic';
}
export interface TechnicalState {
  mode: AutomationMode; technicians: Technician[]; tasks: RepairTask[]; history: RepairRecord[];
  cooldown: Record<string, number>; nextId: number; notice?: string;
  noticeId?: number;
  departing: {id:string;x:number;y:number;remaining:number;fromX:number;fromY:number;kind:'technician'|'contractor';slot?:number}[];
}
export const LEVELS = [
  { name: 'Стажёр', salary: 800, speed: 1, training: 0, seconds: 0, threshold: 30 },
  { name: 'Механик', salary: 1200, speed: 1.5, training: 5000, seconds: 4*3600, threshold: 45 },
  { name: 'Опытный техник', salary: 1800, speed: 2, training: 12000, seconds: 8*3600, threshold: 60 },
  { name: 'Инженер', salary: 2600, speed: 3, training: 25000, seconds: 16*3600, threshold: 75 },
  { name: 'Главный инженер', salary: 3800, speed: 4, training: 50000, seconds: 24*3600, threshold: 85 },
] as const;
export const CONTRACTORS = {
  budget: { name: 'Бюджетный подрядчик', call: 1000, arrival: 120*60, speed: 1 },
  standard: { name: 'Стандартный подрядчик', call: 3000, arrival: 60*60, speed: 2 },
  urgent: { name: 'Срочный подрядчик', call: 8000, arrival: 15*60, speed: 4 },
} as const;
export const TECH_NAMES = ['Алексей','Иван','Дмитрий','Сергей','Андрей','Михаил','Павел','Николай','Максим','Егор','Артём','Виктор','Роман','Олег','Антон','Кирилл'];
export const SERVICE_ENTRANCE = { x: 1100, y: 420 };
export function contractorPose(slot:number,progress:number,direction:'arrival'|'departure'):{x:number;y:number}{
  const park={x:1750-slot*54,y:350};
  const points=direction==='arrival'?[{x:1950+slot*130,y:940},{x:1935,y:850},{x:1935,y:350},park]:
    [park,{x:park.x,y:400},{x:570,y:400},{x:570,y:850},{x:350,y:850},{x:350,y:940},{x:0,y:940}];
  const lengths=points.slice(1).map((point,index)=>Math.hypot(point.x-points[index].x,point.y-points[index].y));
  const total=lengths.reduce((sum,n)=>sum+n,0);
  let distance=Math.max(0,Math.min(1,progress))*total;
  for(let i=0;i<lengths.length;i++){
    if(distance<=lengths[i]||i===lengths.length-1){const ratio=lengths[i]?distance/lengths[i]:0;return {x:points[i].x+(points[i+1].x-points[i].x)*ratio,y:points[i].y+(points[i+1].y-points[i].y)*ratio};}
    distance-=lengths[i];
  }
  return points.at(-1)!;
}
export function createTechnicalState(_gameSeconds: number): TechnicalState {
  return { mode: 'automatic', technicians: [], tasks: [], history: [], cooldown: {}, nextId: 1,
    noticeId:0, departing:[] };
}
export function condition(item: Pump | FuelTank): number { return Math.max(0, Math.min(100, Number.isFinite(item.condition) ? item.condition! : 100)); }
export function wearPump(pump: Pump, ml: number): void {
  const previous=pump.pumpedMlSinceRepair??Math.round((100-condition(pump))*1_500_000);
  pump.pumpedMlSinceRepair=Math.min(150_000_000,previous+Math.max(0,Math.floor(ml)));
  pump.condition=100*(1-pump.pumpedMlSinceRepair/150_000_000);
}
export function wearTank(tank: FuelTank, ml: number): void {
  if(ml>0 && tank.capacityMl>0) tank.condition = Math.max(0, condition(tank) - ml/(tank.capacityMl*500)*100);
}
export function estimateRepair(kind: EquipmentKind, currentCondition: number, speed = 1) {
  const wear = Math.max(0, Math.min(1, (100-currentCondition)/100));
  return { partsKopeks: Math.round((kind==='pump'?20_000:30_000)*100*wear),
    durationSeconds: (kind==='pump'?120:180)*60*wear/speed };
}
export function resaleKopeks(item: Pump | FuelTank): number {
  const original = item.purchasePriceKopeks ?? ('slot' in item ? 2_500_000 : 4_000_000);
  const upgrades = item.paidUpgradeKopeks ?? 0;
  return Math.round((original+upgrades)*(0.1+0.4*condition(item)/100));
}
export function equipmentCondition(equipment: readonly (Pump | FuelTank)[], id: string): number {
  return condition(equipment.find(e=>e.id===id) ?? {condition:100} as Pump);
}
/** Integer millilitres, exact conservation and proportional rounding. */
export function proportionalDraw<T extends {stockMl:number}>(tanks:readonly T[], requestedMl:number):number[] {
  const total=tanks.reduce((sum,t)=>sum+Math.max(0,t.stockMl),0);
  const amount=Math.max(0,Math.min(Math.floor(requestedMl),total));
  if(total===0)return tanks.map(()=>0);
  const shares=tanks.map(t=>Math.floor(amount*Math.max(0,t.stockMl)/total));
  let remainder=amount-shares.reduce((sum,n)=>sum+n,0);
  const order=tanks.map((t,index)=>({index,fraction:amount*Math.max(0,t.stockMl)/total-shares[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
  for(const {index} of order){if(remainder===0)break;if(shares[index]<tanks[index].stockMl){shares[index]++;remainder--;}}
  return shares;
}
