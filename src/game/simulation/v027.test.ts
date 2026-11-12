import { describe, expect, it } from 'vitest';
import { FUEL_IDS } from '../domain/config';
import { ROAD_NODES } from '../domain/roadNetwork';
import { priceSignRows } from '../domain/stationGeometry';
import { footprintBlocked } from './collisions';
import { StationSimulation } from './StationSimulation';
import { cloneLegacyStation } from '../domain/config';
const legacySimulation=(seed?:number)=>new StationSimulation(seed,cloneLegacyStation());

describe('v0.2.7 traffic, price sign and delivery', () => {
  it('shows every fuel on one sign and dims unavailable grades', () => {
    const sim = legacySimulation();
    let rows = priceSignRows(sim.station.tanks, Object.fromEntries(FUEL_IDS.map(id => [id, sim.station.fuels[id].retailKopeks])) as Record<(typeof FUEL_IDS)[number], number>);
    expect(rows.map(row => row.fuel)).toEqual(FUEL_IDS);
    expect(rows.map(row => row.price)).toEqual(['57.00', '63.00', '67.00', '73.00', '79.00', '68.00']);
    sim.station.tanks[0].stockMl = 0;
    rows = priceSignRows(sim.station.tanks, Object.fromEntries(FUEL_IDS.map(id => [id, sim.station.fuels[id].retailKopeks])) as Record<(typeof FUEL_IDS)[number], number>);
    expect(rows[0]).toMatchObject({ available: false, price: '57.00' });
    expect(rows[1]).toMatchObject({ available: true, price: '63.00' });
  });

  it('routes right-hand traffic westbound beside the station, entering on the east and exiting on the west', () => {
    const node = (id: string) => ROAD_NODES.find(item => item.id === id)!;
    expect(node('west_lane_1_east').y).toBeLessThan(node('east_lane_1_west').y);
    expect(node('entrance_decision').x).toBeGreaterThan(node('exit_merge').x);
    expect(node('entrance_decision').next).toContain('entrance_curve');
    expect(node('exit_merge').next).toContain('west_lane_1_west');
  });

  it('keeps vehicle footprints separate through a dense 10x run', () => {
    const sim = legacySimulation(77);
    for (let slot = 2; slot < 10; slot++) sim.buildPump(slot);
    for (let step = 0; step < 1000; step++) {
      sim.step(30);
      for (const vehicle of sim.vehicles) {
        expect(footprintBlocked(vehicle, vehicle.x, vehicle.y, vehicle.angle, sim.vehicles.filter(other => other.id !== vehicle.id))).toBe(false);
      }
    }
    expect(sim.stats.purchases).toBeGreaterThan(3);
  }, 30000);

  it('preserves the two-hour ETA and unloads the actual volume at the displayed rate after restore', () => {
    const sim = legacySimulation(18);
    expect(sim.orderDelivery('ai92', 150)).toBe(true);
    const trip = sim.deliveries[0];
    expect(trip.arrivalGameSeconds - sim.gameSeconds).toBe(7200);
    sim.step(3600);
    expect(trip.status).toBe('enroute');
    const restored = StationSimulation.importSave(sim.exportSave());
    expect(restored.deliveries[0].arrivalGameSeconds - restored.gameSeconds).toBe(3600);
    let unloading = false;
    for (let i = 0; i < 400; i++) {
      restored.step(30);
      if (restored.deliveries[0]?.status === 'unloading') { unloading = true; break; }
    }
    expect(unloading).toBe(true);
    const before = restored.deliveries[0].remainingMl!;
    for(let i=0;i<100&&restored.deliveries[0].remainingMl===before;i++)restored.step(30);
    expect(before - restored.deliveries[0].remainingMl!).toBeGreaterThan(0);
    expect(restored.deliveries[0].totalMl).toBe(150_000);
  }, 30000);
});
