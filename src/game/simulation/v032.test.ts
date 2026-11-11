import { describe, expect, it, vi } from 'vitest';
import { cloneLegacyStation } from '../domain/config';
import { GameEngine } from './GameEngine';
import { StationSimulation } from './StationSimulation';
import { useUiStore } from '../../ui/store';

const sum=(values:readonly number[])=>values.reduce((a,b)=>a+b,0);
describe('v0.3.2 pause and accounting',()=>{
  it('discards hidden time, preserves speed and independent pause reasons',()=>{
    const engine=new GameEngine();const start=engine.getSnapshot();const now=1000;
    engine.setControls(false,10);engine.resetClock(now);engine.pulse(now+50);
    expect(engine.getSnapshot()).toBeCloseTo(start+30,5);
    useUiStore.setState({paused:true,backgroundPause:false,interfacePause:false});
    useUiStore.getState().setBackgroundPause(true);useUiStore.getState().setInterfacePause(true);
    useUiStore.getState().setBackgroundPause(false);
    expect(useUiStore.getState().paused||useUiStore.getState().backgroundPause||useUiStore.getState().interfacePause).toBe(true);
    engine.setControls(true,10);engine.pulse(now+86400000);
    expect(engine.getSnapshot()).toBeCloseTo(start+30,5);
    useUiStore.getState().setInterfacePause(false);
    expect(useUiStore.getState().paused).toBe(true);
    useUiStore.getState().togglePause();engine.setControls(false,10);engine.resetClock(now+86400000);
    engine.pulse(now+86400050);
    expect(engine.getSnapshot()).toBeCloseTo(start+60,5);
    useUiStore.setState({paused:false,backgroundPause:false,interfacePause:false});
  });
  it('records real transactions once and restores history from a v0.3.1 save',()=>{
    const sim=new StationSimulation(7,cloneLegacyStation());
    expect(sim.orderTrip('regional',[{fuel:'ai92',litres:100}])).toBe(true);
    expect(sim.orderTrip('regional',[{fuel:'ai92',litres:100}])).toBe(true);
    const purchases=sim.financeEvents.filter(e=>e.kind==='purchase');
    expect(sum(purchases.map(e=>e.amountKopeks))).toBe(sim.expenses.purchasesKopeks);
    const saved=sim.exportSave();const restored=StationSimulation.importSave(saved);
    expect(restored.financeEvents).toEqual(sim.financeEvents);
    const legacy=StationSimulation.importSave({...saved,version:'0.3.1',state:{...saved.state,financeEvents:undefined}});
    expect(legacy.financeEvents).toEqual([]);
    expect(legacy.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    expect(legacy.deliveries).toEqual(sim.deliveries);
  });
  it('keeps a damaged save untouched during automatic save attempts',()=>{
    const data=new Map([['azs-simulator-save','{broken']]);
    vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
    try{const engine=new GameEngine();engine.buildPump(0);engine.save();expect(data.get('azs-simulator-save')).toBe('{broken');}
    finally{vi.unstubAllGlobals();}
  });
  it('runs ten game days with stable accounting and transport state',()=>{
    const sim=new StationSimulation(12345,cloneLegacyStation());
    const start=sim.gameSeconds;
    for(let i=0;i<28_800;i++)sim.step(30);
    expect(sim.gameSeconds-start).toBe(864000);
    expect(sim.trafficDiagnostics(1800)).toEqual([]);
    expect(sim.stats.revenueKopeks).toBe(sum(sim.financeEvents.filter(e=>e.kind==='sale').map(e=>e.amountKopeks)));
    expect(sim.stats.costKopeks).toBe(sum(sim.financeEvents.filter(e=>e.kind==='sale').map(e=>e.costKopeks??0)));
    expect(sim.expenses.lightingKopeks).toBe(500_000);
    expect(sim.station.balanceKopeks).toBe(50_000_000+sim.stats.revenueKopeks-sim.expenses.lightingKopeks-sim.expenses.pumpElectricityKopeks-sim.expenses.tankMaintenanceKopeks-sim.expenses.pumpingKopeks);
    expect(JSON.stringify(sim.exportSave()).length).toBeLessThan(4_500_000);
  },120000);
});
