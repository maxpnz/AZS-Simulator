import type { FuelId, VehicleCategory } from './types';
export interface VehicleModel {
  id: string; category: VehicleCategory; length: number; width: number; height: number;
  wheelbase: number; turnRadius: number; filler: { x: number; y: number };
  fuels: readonly FuelId[]; acceleration: number; braking: number; silhouette: 'hatch'|'sedan'|'wagon'|'suv'|'van'|'coupe'|'pickup'|'box'|'tractor'|'bus'|'tanker';
}
const petrol: FuelId[] = ['ai92','ai95','ai95plus','ai98','ai100'];
const mixed: FuelId[] = [...petrol,'diesel'];
const diesel: FuelId[] = ['diesel'];
const model = (id:string,category:VehicleCategory,length:number,width:number,height:number,wheelbase:number,turnRadius:number,silhouette:VehicleModel['silhouette'],fuels:FuelId[]=mixed):VehicleModel =>
  ({id,category,length,width,height,wheelbase,turnRadius,silhouette,fuels,filler:{x:-length*.32,y:-width*.48},acceleration:category==='truck'?.8:1.8,braking:category==='truck'?2.4:3.5});
export const VEHICLE_MODELS: readonly VehicleModel[] = [
  model('city-hatch','compact',3.85,1.72,1.49,2.45,5.1,'hatch',petrol),
  model('budget-sedan','sedan',4.38,1.76,1.48,2.62,5.4,'sedan',petrol),
  model('family-sedan','sedan',4.69,1.82,1.47,2.72,5.7,'sedan'),
  model('business-sedan','sedan',4.96,1.88,1.45,2.91,6.1,'sedan'),
  model('estate-wagon','sedan',4.72,1.83,1.53,2.74,5.9,'wagon'),
  model('compact-crossover','crossover',4.39,1.85,1.64,2.66,5.7,'suv'),
  model('mid-suv','suv',4.79,1.94,1.76,2.80,6.1,'suv'),
  model('full-suv','suv',5.10,2.00,1.91,3.05,6.5,'suv'),
  model('minivan','van',4.83,1.90,1.85,2.91,6.2,'van'),
  model('sport-coupe','sedan',4.53,1.89,1.34,2.65,5.8,'coupe',petrol),
  model('pickup','van',5.39,1.92,1.81,3.17,6.7,'pickup'),
  model('delivery-van','van',5.54,2.05,2.53,3.45,7.1,'van',diesel),
  model('medium-truck','truck',8.2,2.48,3.45,4.4,9.5,'box',diesel),
  model('heavy-truck','truck',11.1,2.5,3.85,5.8,11.5,'box',diesel),
  model('semi-trailer','truck',16.5,2.5,3.95,3.6,12.8,'tractor',diesel),
  model('coach-bus','truck',12.0,2.5,3.65,6.1,10.9,'bus',diesel),
  model('fuel-tanker','truck',10.4,2.5,3.7,4.8,10.3,'tanker',diesel),
];
export const modelById = (id?: string) => VEHICLE_MODELS.find((entry)=>entry.id===id) ?? VEHICLE_MODELS[0];
