import { FUEL_IDS } from './config';
import type { FuelId } from './types';

export const COMPETITOR_CONFIG = {
  daySeconds: 86400, hourSeconds: 3600, historyBucketSeconds: 3600,
  marketLevelKopeks: 100, minimumVisitFactor: .22, priceSensitivity: .21,
  restockDelayDays: [1, 2],
} as const;
export type CompetitorKind = 'small'|'large'|'local'|'federal';
export interface CompetitorProfile {
  id:string; name:string; kind:CompetitorKind; description:string; fuels:readonly FuelId[];
  marginKopeks:number; response:number; trust:number; reviewDays:readonly [number,number]; capacityLitres:number; hourlyDemandLitres:number;
}
const all=FUEL_IDS;
export const COMPETITORS:readonly CompetitorProfile[]=[
  {id:'petrovich',name:'У Петровича',kind:'small',description:'Дешёвые, нестабильные цены',fuels:['ai92','ai95','diesel'],marginKopeks:560,response:.28,trust:.72,reviewDays:[1,2],capacityLitres:3000,hourlyDemandLitres:10},
  {id:'trassa58',name:'Трасса 58',kind:'small',description:'Бюджетная АЗС с ограниченным выбором',fuels:['ai92','ai95','diesel'],marginKopeks:620,response:.25,trust:.76,reviewDays:[1,2],capacityLitres:3500,hourlyDemandLitres:12},
  {id:'magistral',name:'Магистраль',kind:'large',description:'Широкий выбор, средняя цена',fuels:['ai92','ai95','ai95plus','ai98','diesel'],marginKopeks:860,response:.17,trust:.91,reviewDays:[2,3],capacityLitres:9000,hourlyDemandLitres:22},
  {id:'forsazh',name:'Форсаж',kind:'large',description:'Премиальный бензин',fuels:['ai92','ai95','ai95plus','ai98','ai100'],marginKopeks:1150,response:.14,trust:.85,reviewDays:[2,3],capacityLitres:8500,hourlyDemandLitres:18},
  {id:'suraoil',name:'СураОйл',kind:'local',description:'Узнаваемая региональная сеть',fuels:['ai92','ai95','ai95plus','diesel'],marginKopeks:850,response:.1,trust:1.04,reviewDays:[3,5],capacityLitres:14000,hourlyDemandLitres:27},
  {id:'regiontop',name:'РегионТоп',kind:'local',description:'Активные скидки',fuels:['ai92','ai95','ai98','ai100','diesel'],marginKopeks:700,response:.12,trust:.99,reviewDays:[3,5],capacityLitres:14000,hourlyDemandLitres:28},
  {id:'neftegrad',name:'Нефтеград',kind:'federal',description:'Высокое доверие',fuels:all,marginKopeks:950,response:.055,trust:1.18,reviewDays:[5,7],capacityLitres:30000,hourlyDemandLitres:42},
  {id:'primeoil',name:'ПраймОйл',kind:'federal',description:'Премиальные цены',fuels:all,marginKopeks:1250,response:.045,trust:1.12,reviewDays:[5,7],capacityLitres:30000,hourlyDemandLitres:39},
  {id:'energoneft',name:'ЭнергоНефть',kind:'federal',description:'Широкий охват и конкурентные цены',fuels:all,marginKopeks:800,response:.07,trust:1.16,reviewDays:[5,7],capacityLitres:32000,hourlyDemandLitres:45},
];
export interface PricePoint {seconds:number; prices:Partial<Record<FuelId,number>>}
export interface CompetitorState {id:string;prices:Partial<Record<FuelId,number>>;stockLitres:Partial<Record<FuelId,number>>;restockAt:Partial<Record<FuelId,number>>;nextReviewSeconds:number;history:PricePoint[]}
export interface CompetitionState {stations:CompetitorState[];nextStockSeconds:number}
function noise(a:number,b:number,c:number):number {let x=(Math.imul(a+1,73856093)^Math.imul(b+3,19349663)^Math.imul(c+7,83492791))>>>0;x^=x>>>16;x=Math.imul(x,2246822519)>>>0;x^=x>>>13;return (x>>>0)/4294967296;}
function reviewInterval(profile:CompetitorProfile,index:number,period:number):number {return (profile.reviewDays[0]+(profile.reviewDays[1]-profile.reviewDays[0])*noise(index,period,3))*COMPETITOR_CONFIG.daySeconds;}
export function createCompetition(seconds:number,base:Record<FuelId,number>):CompetitionState {
  return {stations:COMPETITORS.map((profile,index)=>{
    const prices:Partial<Record<FuelId,number>>={},stockLitres:Partial<Record<FuelId,number>>={};
    for(const fuel of profile.fuels){const fi=FUEL_IDS.indexOf(fuel);
      prices[fuel]=Math.round(base[fuel]+profile.marginKopeks+(noise(index,fi,1)-.5)*130);
      stockLitres[fuel]=Math.round(profile.capacityLitres*(.65+.3*noise(index,fi,2)));
    }
    return {id:profile.id,prices,stockLitres,restockAt:{},nextReviewSeconds:seconds+reviewInterval(profile,index,0),history:[{seconds,prices:{...prices}}]};
  }),nextStockSeconds:(Math.floor(seconds/3600)+1)*3600};
}
export function enforceCompetitorPriceFloor(state:CompetitionState,seconds:number,base:Record<FuelId,number>):void {
  for(const station of state.stations){
    let changed=false;
    for(const fuel of Object.keys(station.prices) as FuelId[]){
      const floor=base[fuel]+1;
      if((station.prices[fuel]??0)<floor){station.prices[fuel]=floor;changed=true;}
    }
    if(changed){
      const last=station.history.at(-1);
      if(last?.seconds===seconds)last.prices={...station.prices};
      else station.history.push({seconds,prices:{...station.prices}});
    }
  }
}
export function advanceCompetition(state:CompetitionState,toSeconds:number,base:Record<FuelId,number>,ourPrices:Record<FuelId,number>):void {
  const day=COMPETITOR_CONFIG.daySeconds;
  for(const [index,station] of state.stations.entries()){
    const profile=COMPETITORS[index];
    while(station.nextReviewSeconds<=toSeconds){
      const tick=station.nextReviewSeconds;
      for(const fuel of profile.fuels){
        const old=station.prices[fuel]??base[fuel]+profile.marginKopeks;
        const target=base[fuel]+profile.marginKopeks;
        const reaction=Math.max(-280,Math.min(280,(ourPrices[fuel]-target)*profile.response));
        const wobble=(noise(index,FUEL_IDS.indexOf(fuel),Math.floor(tick/day)+9)-.5)*(profile.kind==='small'?110:45);
        station.prices[fuel]=Math.round(Math.max(base[fuel]+250,old+Math.max(-180,Math.min(180,(target+reaction+wobble-old)*.55))));
      }
      station.history.push({seconds:tick,prices:{...station.prices}});
      station.nextReviewSeconds+=reviewInterval(profile,index,Math.floor(tick/day));
    }
  }
  while(state.nextStockSeconds<=toSeconds){
    const tick=state.nextStockSeconds;state.nextStockSeconds+=3600;
    for(const [index,station] of state.stations.entries()){
      const profile=COMPETITORS[index];
      for(const fuel of profile.fuels){
        const fi=FUEL_IDS.indexOf(fuel),restock=station.restockAt[fuel];
        if(restock!==undefined&&tick>=restock){station.stockLitres[fuel]=Math.round(profile.capacityLitres*(.7+.25*noise(index,fi,Math.floor(tick/day))));delete station.restockAt[fuel];}
        const usage=profile.hourlyDemandLitres*(.7+.6*noise(index,fi,Math.floor(tick/3600)));
        station.stockLitres[fuel]=Math.max(0,(station.stockLitres[fuel]??0)-usage);
        if((station.stockLitres[fuel]??0)<=0&&station.restockAt[fuel]===undefined){
          const delay=COMPETITOR_CONFIG.restockDelayDays[0]+noise(index,fi,Math.floor(tick/day)+17)*(COMPETITOR_CONFIG.restockDelayDays[1]-COMPETITOR_CONFIG.restockDelayDays[0]);
          station.restockAt[fuel]=tick+delay*day*(profile.kind==='small'?1:profile.kind==='federal'?.4:.7);
        }
      }
    }
  }
  // Wholesale prices move between scheduled reviews. The floor is a cost
  // safeguard, recorded separately from a regular competitive price review.
  enforceCompetitorPriceFloor(state,toSeconds,base);
}
export function availableCompetitorPrices(state:CompetitionState,fuel:FuelId):number[] {return state.stations.filter(s=>(s.stockLitres[fuel]??0)>0&&s.prices[fuel]!==undefined).map(s=>s.prices[fuel]!);}
export function marketAverage(state:CompetitionState,fuel:FuelId):number|undefined {const prices=availableCompetitorPrices(state,fuel);return prices.length?Math.round(prices.reduce((a,b)=>a+b,0)/prices.length):undefined;}
export function marketPosition(state:CompetitionState,fuel:FuelId,ourPrice:number):'Ниже рынка'|'На уровне рынка'|'Выше рынка'|'Нет предложений' {const average=marketAverage(state,fuel);if(average===undefined)return 'Нет предложений';return ourPrice<average-COMPETITOR_CONFIG.marketLevelKopeks?'Ниже рынка':ourPrice>average+COMPETITOR_CONFIG.marketLevelKopeks?'Выше рынка':'На уровне рынка';}
export function competitionVisitFactor(state:CompetitionState,fuel:FuelId,ourPrice:number):number {
  const offers=state.stations.flatMap((station,index)=>{
    const price=station.prices[fuel];return price!==undefined&&(station.stockLitres[fuel]??0)>0?[{price,trust:COMPETITORS[index].trust}]:[];
  });
  if(!offers.length)return 1.2;
  const average=offers.reduce((sum,offer)=>sum+offer.price*offer.trust,0)/offers.reduce((sum,offer)=>sum+offer.trust,0);
  const difference=(ourPrice-average)/100;
  return Math.max(COMPETITOR_CONFIG.minimumVisitFactor,Math.min(1.45,Math.exp(-COMPETITOR_CONFIG.priceSensitivity*difference)));
}
export type HistoryPeriod='day'|'week'|'month'|'all';
export function priceHistory(station:CompetitorState,period:HistoryPeriod,now:number):PricePoint[] {
  const span=period==='day'?86400:period==='week'?7*86400:period==='month'?30*86400:Infinity;
  const start=now-span;const previous=[...station.history].reverse().find(p=>p.seconds<start);
  const points=station.history.filter(p=>p.seconds>=start&&p.seconds<=now);
  const all=previous?[previous,...points]:points;
  const bucket=period==='day'?3600:period==='week'?6*3600:period==='month'?86400:7*86400;
  const grouped=new Map<number,PricePoint>();for(const point of all)grouped.set(Math.floor(point.seconds/bucket),point);
  return [...grouped.values()].sort((a,b)=>a.seconds-b.seconds);
}
