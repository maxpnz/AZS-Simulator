import {describe,expect,it,vi} from 'vitest';
import {cloneLegacyStation,FUEL_IDS} from '../domain/config';
import {pumpQueuePoint,roadContainsPoint} from '../domain/roadNetwork';
import {COMPETITORS,advanceCompetition,createCompetition} from '../domain/competitors';
import type {FuelId,Vehicle} from '../domain/types';
import {StationSimulation} from './StationSimulation';
import {GameEngine} from './GameEngine';
import {createVehicle,RandomSource} from './traffic';

function dieselSim():StationSimulation {
  const station=cloneLegacyStation();
  station.tanks.push({id:'diesel-tank',fuel:'diesel',capacityMl:2_500_000,stockMl:2_000_000,status:'active'});
  station.fuels.diesel.stockMl=2_000_000;station.fuels.diesel.capacityMl=2_500_000;
  station.pumps[0].fuels=['diesel'];station.pumps[1].enabled=false;
  return new StationSimulation(7,station);
}
function roadTruck(modelId:string,id:number):Vehicle {
  const v=createVehicle(id,86400,new RandomSource(id));
  Object.assign(v,{fuel:'diesel',modelId,category:'truck',status:'road',route:['west_lane_1_west'],routeIndex:0,
    x:1850,y:940,angle:Math.PI,westbound:true,laneId:'west_lane_1',tankCapacityMl:1_000_000,
    currentFuelMl:200_000,behavior:'volume',requestedMl:150_000,budgetKopeks:5_000_000});
  return v;
}
describe('v0.5.1 traffic fixes',()=>{
  it('keeps a two-day mixed traffic run clear of persistent stalls',()=>{
    const sim=new StationSimulation(0x41a25,cloneLegacyStation());
    for(let i=0;i<6000;i++){
      sim.step(30);
      if(i%100===0)expect(sim.trafficDiagnostics(1500)).toEqual([]);
    }
    expect(sim.stats.purchases).toBeGreaterThan(20);
    expect(sim.queueIds.every(id=>sim.vehicles.some(v=>v.id===id&&v.pumpId&&['entering','queued'].includes(v.status)))).toBe(true);
  });
  it('keeps five active pumps and diesel traffic moving after a save reload',()=>{
    const station=cloneLegacyStation();
    station.tanks.push({id:'diesel-tank',fuel:'diesel',capacityMl:2_500_000,stockMl:2_000_000,status:'active'});
    station.fuels.diesel.stockMl=2_000_000;station.fuels.diesel.capacityMl=2_500_000;
    station.pumps.push(
      {id:'pump-3',slot:2,fuels:['ai92','ai95','diesel'],status:'ready',flowMultiplier:1,enabled:true},
      {id:'pump-5',slot:4,fuels:['diesel'],status:'ready',flowMultiplier:1,enabled:true},
      {id:'pump-6',slot:5,fuels:['ai92','ai95'],status:'ready',flowMultiplier:1,enabled:true},
    );
    let sim=new StationSimulation(77,station);
    const truckSales=new Set<number>();
    for(let i=0;i<10000;i++){
      sim.step(30);
      for(const sale of sim.recentSales)if(sale.category==='truck')truckSales.add(sale.vehicleId);
      if(i===5000)sim=StationSimulation.importSave(sim.exportSave());
      if(i%200===0){const diagnostics=sim.trafficDiagnostics(1500);expect(diagnostics,JSON.stringify(diagnostics.map(row=>{const v=sim.vehicles.find(v=>v.id===row.id)!;return {row,vehicle:v,nearby:sim.vehicles.filter(o=>o.id!==v.id&&Math.hypot(o.x-v.x,o.y-v.y)<220).map(o=>({id:o.id,status:o.status,pumpId:o.pumpId,x:o.x,y:o.y,node:o.route[o.routeIndex]}))};}))).toEqual([]);}
    }
    expect(sim.stats.purchases).toBeGreaterThan(20);
    expect(truckSales.size).toBeGreaterThan(0);
  },30000);
  it('marks a separate queue bay for every dispenser on the forecourt',()=>{
    const locations=new Set<string>();
    for(let slot=0;slot<10;slot++){
      const p=pumpQueuePoint(slot);locations.add(`${p.x},${p.y}`);
      expect(roadContainsPoint(p.x,p.y)).toBe(true);
    }
    expect(locations.size).toBe(10);
    expect(roadContainsPoint(1000,1060)).toBe(false);
  });
  it('never prices competitor fuel below the current wholesale baseline',()=>{
    const base=Object.fromEntries(FUEL_IDS.map(f=>[f,5000])) as Record<FuelId,number>;
    const state=createCompetition(86400,base);
    const changed={...base,ai92:6600};
    advanceCompetition(state,86400+3600,changed,base);
    for(const [index,station] of state.stations.entries())for(const fuel of COMPETITORS[index].fuels)
      expect(station.prices[fuel]).toBeGreaterThan(changed[fuel]);
    expect(state.stations[0].history.at(-1)?.prices.ai92).toBeGreaterThan(changed.ai92);
  });
  it('uses the large-queue refusal only when six customers are shown waiting',()=>{
    for(const waiting of [5,6]){
      const sim=new StationSimulation(4,cloneLegacyStation());
      for(let i=0;i<waiting;i++){
        const queued=createVehicle(100+i,86400,new RandomSource(100+i));
        Object.assign(queued,{status:'queued',fuel:'ai92',modelId:'budget-sedan',x:600+i*50,y:755});
        sim.vehicles.push(queued);sim.queueIds.push(queued.id);
      }
      const candidate=createVehicle(200,86400,new RandomSource(200));
      Object.assign(candidate,{fuel:'ai92',modelId:'budget-sedan',category:'sedan',laneId:'west_lane_1',x:1850,y:940});
      sim.vehicles.push(candidate);
      (sim as unknown as {decideVisit:(vehicle:Vehicle)=>void}).decideVisit(candidate);
      expect(candidate.refusalReason==='Большая очередь').toBe(waiting===6);
    }
  });
  it('repairs a 0.5 save with large vehicles stuck at the entrance',()=>{
    const sim=dieselSim();
    for(let i=0;i<2;i++){
      const truck=roadTruck('semi-trailer',300+i);
      Object.assign(truck,{status:'entering',route:['entrance_curve','entrance'],routeIndex:0,x:1890+i*30,y:860});
      sim.vehicles.push(truck);
    }
    const before=sim.exportSave();before.version='0.5.0';before.nextSpawnSeconds=1_000_000_000;
    const restored=StationSimulation.importSave(before);
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(restored.station.fuels.diesel.stockMl).toBe(sim.station.fuels.diesel.stockMl);
    expect(restored.vehicles.filter(v=>v.status==='entering')).toHaveLength(0);
    expect(restored.vehicles.filter(v=>v.status==='toPump')).toHaveLength(1);
    expect(restored.queueIds.every(id=>{const v=restored.vehicles.find(x=>x.id===id)!;return v.pumpId&&v.x===pumpQueuePoint(Number(v.pumpId.split('-')[1])-1).x;})).toBe(true);
    for(let i=0;i<3000&&restored.stats.purchases===0;i++)restored.step(3);
    expect(restored.stats.purchases).toBe(1);
  });
  it('keeps the original 0.5 save before its first 0.5.1 write',()=>{
    const old={...dieselSim().exportSave(),version:'0.5.0'};
    const original=JSON.stringify(old),data=new Map([['azs-simulator-save',original]]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
    try{
      const engine=new GameEngine();engine.save();
      expect(data.get('azs-simulator-save-v05-backup')).toBe(original);
      expect(JSON.parse(data.get('azs-simulator-save')!).version).toBe('0.5.2');
      engine.save();expect(data.get('azs-simulator-save-v05-backup')).toBe(original);
    }finally{vi.unstubAllGlobals();}
  });
  it.each(['medium-truck','heavy-truck','semi-trailer','coach-bus','fuel-tanker'])('takes %s from the road to a dispenser and clears the station',modelId=>{
    let served=false;
    for(let seed=1;seed<=8&&!served;seed++){
      const saved=dieselSim().exportSave();saved.nextSpawnSeconds=1_000_000_000;
      const sim=StationSimulation.importSave(saved),v=roadTruck(modelId,seed);
      sim.vehicles.push(v);
      (sim as unknown as {decideVisit:(vehicle:Vehicle)=>void}).decideVisit(v);
      if(v.status==='road')continue;
      for(let step=0;step<3000&&sim.vehicles.includes(v);step++)sim.step(3);
      expect(sim.recentSales[0]?.volumeMl,`${modelId}: ${JSON.stringify(sim.trafficDiagnostics(60))}`).toBe(150_000);
      expect(sim.vehicles.includes(v),`${modelId}: ${JSON.stringify(sim.trafficDiagnostics(60))}`).toBe(false);
      served=true;
    }
    expect(served,`${modelId} never chose to enter`).toBe(true);
  },30000);
});
