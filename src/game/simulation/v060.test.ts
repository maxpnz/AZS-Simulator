import { describe, expect, it } from 'vitest';
import { StationSimulation } from './StationSimulation';
import { cloneLegacyStation } from '../domain/config';
import { condition, estimateRepair, proportionalDraw, resaleKopeks, wearPump, wearTank } from '../domain/technical';
import { createVehicle, RandomSource } from './traffic';

function quietSim(){const sim=new StationSimulation(6,cloneLegacyStation());sim.setAutomation('manual');return sim;}

describe('v0.6 equipment and technical service',()=>{
  it('applies the specified operating wear and conserves proportional stock',()=>{
    const pump=quietSim().station.pumps[0];wearPump(pump,1_500_000);expect(condition(pump)).toBeCloseTo(99,8);
    const tank=quietSim().station.tanks[0];wearTank(tank,tank.capacityMl);wearTank(tank,tank.capacityMl);expect(condition(tank)).toBeCloseTo(99.6,8);
    tank.capacityMl*=2;wearTank(tank,tank.capacityMl);expect(condition(tank)).toBeCloseTo(99.4,8);
    const shares=proportionalDraw([{stockMl:1},{stockMl:1},{stockMl:1}],2);
    expect(shares.reduce((a,b)=>a+b,0)).toBe(2);expect(shares.every(n=>n>=0&&n<=1)).toBe(true);
  });
  it('migrates 0.5.2 once and persists exact condition and existing economy',()=>{
    const old=quietSim().exportSave();old.version='0.5.2';delete old.state.technical;
    for(const p of old.state.station.pumps)delete p.condition;
    for(const t of old.state.station.tanks)delete t.condition;
    const restored=StationSimulation.importSave(old);
    expect(restored.station.pumps.every(p=>condition(p)===100)).toBe(true);
    expect(restored.station.balanceKopeks).toBe(old.state.station.balanceKopeks);
    restored.station.pumps[0].condition=47.234567;
    expect(StationSimulation.importSave(restored.exportSave()).station.pumps[0].condition).toBe(47.234567);
    expect(StationSimulation.importSave(restored.exportSave()).technical.technicians).toHaveLength(0);
  });
  it('hires at level one, pays once, trains and resumes without duplicate charges',()=>{
    const sim=quietSim();expect(sim.hireTechnician('Иван')).toBe(true);
    const afterHire=sim.station.balanceKopeks;
    expect(sim.technical.technicians[0].level).toBe(1);
    sim.step(60);expect(sim.station.balanceKopeks).toBeLessThan(afterHire);
    expect(sim.trainTechnician(sim.technical.technicians[0].id)).toBe(true);
    const afterTraining=sim.station.balanceKopeks;
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.station.balanceKopeks).toBe(afterTraining);
    expect(restored.financeEvents.filter(e=>e.kind==='technicianStaff')).toHaveLength(2);
    restored.step(4*3600);expect(restored.technical.technicians[0].level).toBe(2);
  });
  it('charges a contractor once, resumes paid work and journals one completion',()=>{
    const sim=quietSim();sim.station.pumps[0].condition=50;
    const expected=estimateRepair('pump',50,4);
    const balance=sim.station.balanceKopeks;
    expect(sim.callContractor('pump-1','urgent')).toBe(true);
    expect(sim.station.balanceKopeks).toBe(balance-expected.partsKopeks-800_000);
    expect(sim.callContractor('pump-1','urgent')).toBe(false);
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.station.balanceKopeks).toBe(sim.station.balanceKopeks);
    restored.step(15*60+expected.durationSeconds+30);
    expect(condition(restored.station.pumps[0])).toBe(100);
    expect(restored.technical.history).toHaveLength(1);
    expect(restored.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(1);
  });
  it('cancels unpaid work, preserves wear, and computes resale from purchase and upgrades',()=>{
    const sim=quietSim();sim.station.pumps[0].condition=40;
    expect(sim.hireTechnician()).toBe(true);
    expect(sim.assignRepair('pump-1',sim.technical.technicians[0].id)).toBe(true);
    expect(sim.cancelRepair('pump-1')).toBe(true);
    expect(condition(sim.station.pumps[0])).toBe(40);
    expect(sim.technical.cooldown['pump-1']).toBe(sim.gameSeconds+3600);
    sim.station.pumps[0].paidUpgradeKopeks=1_200_000;
    expect(resaleKopeks(sim.station.pumps[0])).toBe(Math.round(3_700_000*.26));
  });
  it('pays a staff repair at the actual start, then resumes at saved progress',()=>{
    const sim=quietSim();sim.station.pumps[0].condition=50;
    expect(sim.hireTechnician('Роман')).toBe(true);
    const id=sim.technical.technicians[0].id;
    expect(sim.assignRepair('pump-1',id)).toBe(true);
    const balance=sim.station.balanceKopeks;
    sim.step(30);expect(sim.technical.tasks[0].paid).toBe(false);
    expect(sim.station.balanceKopeks).toBeLessThan(balance); // salary only
    expect(sim.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(0);
    sim.step(30);expect(sim.technical.tasks[0].paid).toBe(true);
    expect(sim.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(1);
    sim.step(300);
    const remaining=sim.technical.tasks[0].phaseRemaining;
    const restored=StationSimulation.importSave(sim.exportSave());
    expect(restored.technical.tasks[0].phaseRemaining).toBe(remaining);
    expect(restored.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(1);
    restored.step(remaining);
    expect(restored.technical.tasks).toHaveLength(0);
    expect(restored.technical.history).toHaveLength(1);
    expect(restored.technical.history[0].executorName).toBe('Роман');
    expect(restored.renameTechnician(id,'Иван')).toBe(true);
    expect(restored.technical.history[0].executorName).toBe('Роман');
  });
  it('keeps an unpaid assignment after insufficient funds and frees equipment until funds arrive',()=>{
    const sim=quietSim();sim.station.pumps[0].condition=20;
    expect(sim.hireTechnician()).toBe(true);
    sim.station.balanceKopeks=0;
    expect(sim.assignRepair('pump-1',sim.technical.technicians[0].id)).toBe(true);
    sim.step(60);
    expect(sim.technical.tasks[0].paid).toBe(false);
    expect(sim.technical.tasks[0].blocked).toBe(false);
    expect(sim.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(0);
    sim.station.balanceKopeks=2_000_000;
    sim.step(3);
    expect(sim.technical.tasks[0].paid).toBe(true);
    expect(sim.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(1);
    expect(sim.cancelRepair('pump-1')).toBe(false);
  });
  it('preempts only a lower category unpaid automatic assignment',()=>{
    const sim=quietSim();expect(sim.hireTechnician()).toBe(true);
    sim.setAutomation('automatic');sim.station.pumps[0].condition=29;
    sim.step(3);expect(sim.technical.tasks[0].equipmentId).toBe('pump-1');
    sim.station.tanks[0].condition=0;sim.step(3);
    expect(sim.technical.tasks.some(t=>t.equipmentId==='tank-ai92-1')).toBe(true);
    expect(sim.technical.tasks.some(t=>t.equipmentId==='pump-1')).toBe(false);
  });
  it('distributes actual dispensing over healthy connected tanks and slows a worn pump',()=>{
    const sim=quietSim();sim.station.tanks.push({id:'tank-ai92-2',fuel:'ai92',capacityMl:2_500_000,stockMl:1_000_000,status:'active',condition:100});
    sim.station.fuels.ai92.stockMl=3_000_000;sim.station.fuels.ai92.capacityMl=5_000_000;
    sim.station.pumps[0].condition=50;
    const vehicle=createVehicle(42,sim.gameSeconds,new RandomSource(42));
    Object.assign(vehicle,{fuel:'ai92',status:'fueling',servicePhase:'dispensing',phaseRemainingSeconds:0,pumpId:'pump-1',reservedMl:100_000,
      deliveredMl:0,chargedKopeks:0,serviceRemainingSeconds:100,setupRemainingSeconds:0,salePriceKopeks:5700,tankIds:['tank-ai92-1','tank-ai92-2']});
    sim.vehicles.push(vehicle);sim.step(10);
    expect(vehicle.deliveredMl).toBe(4800);
    expect(sim.station.tanks[0].stockMl).toBe(2_000_000-3200);
    expect(sim.station.tanks[2].stockMl).toBe(1_000_000-1600);
    expect(sim.station.fuels.ai92.stockMl).toBe(3_000_000-4800);
  });
  it('allocates salary to actual game days and applies the trained rate after completion',()=>{
    const sim=quietSim();sim.gameSeconds=86400-90;
    expect(sim.hireTechnician('Павел')).toBe(true);
    sim.step(60);sim.step(60);
    const salary=sim.financeEvents.filter(e=>e.kind==='technicianSalary');
    expect(salary).toHaveLength(2);
    expect(salary[0].gameSeconds).toBeLessThan(86400);
    expect(salary[1].gameSeconds).toBeGreaterThan(86400);
    expect(sim.trainTechnician(sim.technical.technicians[0].id)).toBe(true);
    sim.step(4*3600);
    expect(sim.technical.technicians[0].level).toBe(2);
    const count=sim.financeEvents.filter(e=>e.kind==='technicianSalary').length;sim.step(60);
    const nextSalary=sim.financeEvents.filter(e=>e.kind==='technicianSalary').slice(count);
    expect(nextSalary).toHaveLength(1);
    expect(nextSalary[0].amountKopeks).toBeGreaterThanOrEqual(83);
  });
  it('lets two paid contractors arrive and repair different objects in parallel',()=>{
    const raw=quietSim().exportSave();raw.nextSpawnSeconds=1_000_000_000;
    const sim=StationSimulation.importSave(raw);sim.setAutomation('manual');
    sim.station.pumps[0].condition=50;sim.station.pumps[1].condition=60;
    expect(sim.callContractor('pump-1','urgent')).toBe(true);
    expect(sim.callContractor('pump-2','urgent')).toBe(true);
    expect(new Set(sim.technical.tasks.map(t=>t.parkingSlot)).size).toBe(2);
    for(let i=0;i<1000&&sim.technical.tasks.length;i++)sim.step(3);
    expect(sim.technical.tasks).toHaveLength(0);
    expect(sim.technical.history).toHaveLength(2);
    expect(sim.financeEvents.filter(e=>e.kind==='equipmentRepair')).toHaveLength(2);
  });
  it('completes contractor traffic and departure without trapping station vehicles',()=>{
    const sim=quietSim();sim.station.pumps[0].condition=50;
    expect(sim.callContractor('pump-1','urgent')).toBe(true);
    for(let i=0;i<2500&&sim.technical.tasks.length;i++)sim.step(3);
    expect(sim.technical.history).toHaveLength(1);
    for(let i=0;i<300&&sim.technical.departing.length;i++)sim.step(3);
    expect(sim.technical.departing).toHaveLength(0);
    expect(sim.trafficDiagnostics(1800)).toHaveLength(0);
  });
});
