import {describe,it,expect} from 'vitest';
import {StationSimulation} from './StationSimulation';
import {cloneLegacyStation} from '../domain/config';
import {encodeStoredSave} from './GameEngine';

describe('v0.7 long-run balance',()=>{
 it('keeps cash, stock and parking valid over 7 and 30 game days',()=>{
  const sim=new StationSimulation(24680,cloneLegacyStation());
  expect(sim.openVenue('shop')).toBe(true);expect(sim.openVenue('cafe')).toBe(true);
  expect(sim.orderGoods('standard',{water:100,hotdog:100,chocolate:100,snacks:100,coffee:50000,milk:50000,cake:100,pie:100})).toBe(true);
  const reports=[];
  for(let day=1;day<=30;day++){
   for(let i=0;i<1440;i++)sim.step(60);const reorder:Record<string,number>={};for(const sku of ['water','hotdog','chocolate','snacks','cake','pie'] as const)if(sim.commerce.stock[sku].quantity<60)reorder[sku]=100-sim.commerce.stock[sku].quantity;if(sim.commerce.stock.coffee.quantity<20000)reorder.coffee=50000-sim.commerce.stock.coffee.quantity;if(sim.commerce.stock.milk.quantity<20000)reorder.milk=50000-sim.commerce.stock.milk.quantity;if(Object.keys(reorder).length)expect(sim.orderGoods('standard',reorder)).toBe(true);
   if(day===7||day===30){const occupied=sim.commerce.parking.filter((id):id is number=>id!==null);expect(new Set(occupied).size).toBe(occupied.length);expect(Object.values(sim.commerce.stock).every(s=>s.quantity>=0&&s.valueKopeks>=0)).toBe(true);expect(Number.isFinite(sim.station.balanceKopeks)).toBe(true);reports.push({day,balance:sim.station.balanceKopeks,shopRevenue:sim.commerce.venues.shop.revenueKopeks,cafeRevenue:sim.commerce.venues.cafe.revenueKopeks,shopCost:sim.commerce.venues.shop.costKopeks,cafeCost:sim.commerce.venues.cafe.costKopeks,shopLost:sim.commerce.venues.shop.lost,cafeLost:sim.commerce.venues.cafe.lost,goodsSales:sim.financeEvents.filter(e=>e.kind==='goodsSale').length,passed:sim.stats.passed,visited:sim.stats.visited,fuelPurchases:sim.stats.purchases,vehicles:sim.vehicles.length,parking:occupied.length,shopQueue:sim.commerce.venues.shop.queue.length,cafeQueue:sim.commerce.venues.cafe.queue.length,shopServing:sim.commerce.venues.shop.serving,cafeServing:sim.commerce.venues.cafe.serving,statuses:sim.vehicles.map(v=>v.status).slice(0,10),parkingCars:sim.vehicles.filter(v=>v.status==='toParking').map(v=>({id:v.id,node:v.route[v.routeIndex],x:Math.round(v.x),y:Math.round(v.y),slot:v.parkSlot})).slice(0,3),stalls:sim.trafficDiagnostics(1800).slice(0,5)});}
  }
  expect(reports).toHaveLength(2);
  const saveBytes=new TextEncoder().encode(JSON.stringify(sim.exportSave())).length;
  const packedChars=encodeStoredSave(JSON.stringify(sim.exportSave())).length;
  console.info(`30-day save size: ${saveBytes} bytes, compressed: ${packedChars} UTF-16 units; fuel sales: ${sim.stats.purchases}`);
  expect(saveBytes).toBeLessThan(4_000_000);
  expect(packedChars).toBeLessThan(saveBytes/2);
 },90000);
});
