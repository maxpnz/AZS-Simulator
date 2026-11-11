import { FUEL_IDS, INITIAL_STATION } from './config';
import type { FuelId } from './types';

const DAY = 86_400;
const HOUR = 3_600;
export interface SupplierConfig {
  id: string; name: string; profile: string; priceOffsetKopeks: number;
  etaHours: readonly [number, number]; capacityLitres: number; initialRatio: number;
  demandLitresPerHour: number; restockHours: number; batchLitres: number;
  availability: number; specialties?: Partial<Record<FuelId, {priceOffsetKopeks?: number; availability?: number}>>;
}
export const SUPPLIERS: readonly SupplierConfig[] = [
  {id:'reserve',name:'ПетроРезерв',profile:'Надёжный опт',priceOffsetKopeks:350,etaHours:[24,72],capacityLitres:32000,initialRatio:.9,demandLitresPerHour:95,restockHours:24,batchLitres:12000,availability:.98},
  {id:'discount',name:'ДисконтНефть',profile:'Низкая цена',priceOffsetKopeks:-175,etaHours:[8,24],capacityLitres:6500,initialRatio:.32,demandLitresPerHour:180,restockHours:8,batchLitres:1800,availability:.34},
  {id:'express',name:'ЭкспрессОйл',profile:'Срочная доставка',priceOffsetKopeks:250,etaHours:[2,6],capacityLitres:12000,initialRatio:.7,demandLitresPerHour:110,restockHours:12,batchLitres:5000,availability:.75},
  {id:'distant',name:'ДальНефтеТранс',profile:'Дешёвый дальний опт',priceOffsetKopeks:-75,etaHours:[48,120],capacityLitres:28000,initialRatio:.8,demandLitresPerHour:100,restockHours:30,batchLitres:13000,availability:.78},
  {id:'regional',name:'РегионТопливо',profile:'Регулярные поставки',priceOffsetKopeks:0,etaHours:[8,18],capacityLitres:18000,initialRatio:.8,demandLitresPerHour:100,restockHours:16,batchLitres:7000,availability:.88},
  {id:'north',name:'СеверОйл',profile:'Специалист по ДТ',priceOffsetKopeks:80,etaHours:[12,36],capacityLitres:14000,initialRatio:.4,demandLitresPerHour:115,restockHours:20,batchLitres:5500,availability:.4,specialties:{diesel:{priceOffsetKopeks:-100,availability:.95}}},
  {id:'prime',name:'ПраймПетрол',profile:'Премиальные марки',priceOffsetKopeks:80,etaHours:[10,30],capacityLitres:9000,initialRatio:.4,demandLitresPerHour:100,restockHours:18,batchLitres:3500,availability:.4,specialties:{ai95plus:{priceOffsetKopeks:-65,availability:.9},ai98:{priceOffsetKopeks:-75,availability:.9},ai100:{priceOffsetKopeks:-85,availability:.9}}},
];
export interface WarehouseFuel {litres:number;capacityLitres:number;nextRestockSeconds:number;consumptionRemainder:number}
export interface MarketModifiers {
  basePriceBps?: Partial<Record<FuelId,number>>; supplierAvailabilityBps?: Partial<Record<string,number>>;
  supplierBatchBps?: Partial<Record<string,number>>; supplierEtaBps?: Partial<Record<string,number>>;
  wholesaleBps?: number; demandBps?: number;
}
export interface MarketState {
  baseKopeks:Record<FuelId,number>; targetKopeks:Record<FuelId,number>;
  warehouses:Record<string,Record<FuelId,WarehouseFuel>>;
  nextPriceSeconds:number; nextWeekSeconds:number; nextWarehouseSeconds:number;
  competitorKopeks:Record<FuelId,number>; modifiers:MarketModifiers;
}
const hash=(a:number,b:number,c:number)=>{let x=(Math.imul(a+1,73856093)^Math.imul(b+3,19349663)^Math.imul(c+7,83492791))>>>0;x^=x>>>16;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;return (x>>>0)/4294967296;};
const fuelIndex=(fuel:FuelId)=>FUEL_IDS.indexOf(fuel);
export function supplierById(id:string):SupplierConfig|undefined {
  // Old orders from v0.3.2 retain their supplier name; the old union accepts legacy test saves.
  return SUPPLIERS.find(s=>s.id===id)|| (id==='union'?SUPPLIERS.find(s=>s.id==='regional'):undefined);
}
export function createMarket(gameSeconds:number):MarketState {
  const baseKopeks=Object.fromEntries(FUEL_IDS.map(f=>[f,INITIAL_STATION.fuels[f].wholesaleKopeks])) as Record<FuelId,number>;
  const warehouses=Object.fromEntries(SUPPLIERS.map((s,si)=>[s.id,Object.fromEntries(FUEL_IDS.map((f,fi)=>{
    const availability=s.specialties?.[f]?.availability??s.availability;
    const present=s.id==='reserve'||s.id==='regional'||hash(si,fi,0)<availability;
    return [f,{litres:present?Math.round(s.capacityLitres*s.initialRatio*(.7+.3*hash(si,fi,1))):0,
      capacityLitres:s.capacityLitres,nextRestockSeconds:gameSeconds+s.restockHours*HOUR*(.5+.5*hash(si,fi,2)),consumptionRemainder:0}];
  }))])) as Record<string,Record<FuelId,WarehouseFuel>>;
  return {baseKopeks,targetKopeks:{...baseKopeks},warehouses,nextPriceSeconds:gameSeconds+6*HOUR,
    nextWeekSeconds:(Math.floor(gameSeconds/(7*DAY))+1)*7*DAY,nextWarehouseSeconds:(Math.floor(gameSeconds/HOUR)+1)*HOUR,
    competitorKopeks:Object.fromEntries(FUEL_IDS.map(f=>[f,INITIAL_STATION.fuels[f].retailKopeks])) as Record<FuelId,number>,modifiers:{}};
}
export function advanceMarket(market:MarketState,toSeconds:number):void {
  while(market.nextWarehouseSeconds<=toSeconds){
    const tick=market.nextWarehouseSeconds;market.nextWarehouseSeconds+=HOUR;
    for(const [si,s] of SUPPLIERS.entries())for(const fuel of FUEL_IDS){
      const store=market.warehouses[s.id][fuel];const fi=fuelIndex(fuel);
      const demand=s.demandLitresPerHour*(.8+.4*hash(si,fi,Math.floor(tick/HOUR)));
      store.litres=Math.max(0,store.litres-Math.floor(demand));
      if(tick>=store.nextRestockSeconds){
        const availability=(s.specialties?.[fuel]?.availability??s.availability)*(market.modifiers.supplierAvailabilityBps?.[s.id]??10000)/10000;
        if(hash(si,fi,Math.floor(tick/(s.restockHours*HOUR))+11)<availability){
          const batch=s.batchLitres*(market.modifiers.supplierBatchBps?.[s.id]??10000)/10000;
          store.litres=Math.min(store.capacityLitres,store.litres+Math.round(batch));
        }
        store.nextRestockSeconds=tick+s.restockHours*HOUR*(.8+.4*hash(si,fi,Math.floor(tick/HOUR)+17));
      }
    }
    for(const fuel of FUEL_IDS)if(SUPPLIERS.every(s=>market.warehouses[s.id][fuel].litres===0)){
      const reserve=market.warehouses.reserve[fuel];reserve.litres=Math.min(reserve.capacityLitres,500);
    }
  }
  while(market.nextWeekSeconds<=toSeconds){
    const week=Math.floor(market.nextWeekSeconds/(7*DAY));
    for(const fuel of FUEL_IDS){const fi=fuelIndex(fuel);const growth=.001+.003*hash(fi,week,19);
      market.targetKopeks[fuel]=Math.min(INITIAL_STATION.fuels[fuel].wholesaleKopeks*1.8,market.targetKopeks[fuel]*(1+growth));}
    market.nextWeekSeconds+=7*DAY;
  }
  while(market.nextPriceSeconds<=toSeconds){
    const period=Math.floor(market.nextPriceSeconds/(6*HOUR));
    for(const fuel of FUEL_IDS){const fi=fuelIndex(fuel),base=market.baseKopeks[fuel];
      const noise=(hash(fi,period,41)-.5)*.008;
      const target=market.targetKopeks[fuel]*(market.modifiers.basePriceBps?.[fuel]??10000)/10000;
      market.baseKopeks[fuel]=Math.max(100,Math.round(base+(target-base)*.16+target*noise*.25));
      market.competitorKopeks[fuel]=Math.max(market.baseKopeks[fuel]+350,Math.round(market.baseKopeks[fuel]+(INITIAL_STATION.fuels[fuel].retailKopeks-INITIAL_STATION.fuels[fuel].wholesaleKopeks)+(hash(fi,period,59)-.5)*90));
    }
    market.nextPriceSeconds+=6*HOUR;
  }
}
export interface FuelOffer {supplierId:string;fuel:FuelId;priceKopeks:number;availableLitres:number;etaGameSeconds:number;nextRestockSeconds:number}
export function marketOffer(market:MarketState,supplierId:string,fuel:FuelId,gameSeconds:number):FuelOffer|undefined {
  const s=supplierById(supplierId);if(!s)return undefined;
  const store=market.warehouses[s.id][fuel];const fi=fuelIndex(fuel),si=SUPPLIERS.indexOf(s);
  const priceKopeks=Math.max(100,Math.round((market.baseKopeks[fuel]+(s.specialties?.[fuel]?.priceOffsetKopeks??s.priceOffsetKopeks)+(hash(si,fi,Math.floor(gameSeconds/(6*HOUR)))-.5)*45)*(market.modifiers.wholesaleBps??10000)/10000));
  const etaHours=s.etaHours[0]+(s.etaHours[1]-s.etaHours[0])*hash(si,fi,Math.floor(gameSeconds/DAY)+73);
  const delay=s.id==='distant'&&hash(si,fi,Math.floor(gameSeconds/DAY)+97)<.045?48:0;
  return {supplierId:supplierId,fuel,priceKopeks,availableLitres:store.litres,
    etaGameSeconds:Math.round((etaHours+delay)*HOUR*(market.modifiers.supplierEtaBps?.[s.id]??10000)/10000),nextRestockSeconds:store.nextRestockSeconds};
}
