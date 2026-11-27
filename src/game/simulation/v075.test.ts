import { describe, expect, it, vi } from 'vitest';
import { goodsUnloadSeconds, GOODS_DRIVE_SECONDS } from '../domain/goodsDelivery';
import { PARKING_SLOTS, ROAD_NODES, TRUCK_BAY } from '../domain/roadNetwork';
import { usedSpace } from '../domain/commerce';
import { cloneLegacyStation } from '../domain/config';
import { GameEngine } from './GameEngine';
import { StationSimulation } from './StationSimulation';
import { footprintBlocked } from './collisions';
import type { Vehicle } from '../domain/types';

describe('v0.7.5', () => {
  it('queues goods, resumes unloading after a save and credits the correct warehouses once', () => {
    const sim = new StationSimulation();
    expect(sim.openVenue('shop')).toBe(true);
    expect(sim.openVenue('cafe')).toBe(true);
    expect(sim.orderGoods('express', { water: 30 })).toBe(true);
    expect(sim.orderGoods('express', { milk: 1000 })).toBe(true);

    sim.step(1800 + GOODS_DRIVE_SECONDS + 30);
    const [first, second] = sim.commerce.orders;
    expect(first.status).toBe('unloading');
    expect(first.phaseSeconds).toBe(30);
    expect(usedSpace(sim.commerce, 'shop')).toBe(30);
    expect(sim.commerce.stock.water.quantity).toBe(0);
    expect(second.status).toMatch(/^(enroute|waiting)$/);

    const restored = StationSimulation.importSave(sim.exportSave());
    const remaining = goodsUnloadSeconds(first) - 30;
    restored.step(0);
    expect(restored.commerce.orders[0].phaseSeconds).toBe(30);
    for (let elapsed = 0; elapsed < remaining - 1; elapsed++) restored.step(1);
    expect(restored.commerce.stock.water.quantity).toBe(0);
    restored.step(1);
    expect(restored.commerce.stock.water.quantity).toBe(30);
    expect(restored.commerce.orders[0]).toMatchObject({ status: 'leaving', credited: true });
    expect(restored.commerce.stock.milk.quantity).toBe(0);

    const afterCredit = StationSimulation.importSave(restored.exportSave());
    for (let i = 0; i < 100; i++) afterCredit.step(30);
    expect(afterCredit.commerce.orders.map(order => order.status)).toEqual(['delivered', 'delivered']);
    expect(afterCredit.commerce.stock.water.quantity).toBeLessThanOrEqual(30);
    expect(afterCredit.commerce.stock.milk.quantity).toBe(1000);
    expect(afterCredit.financeEvents.filter(event => event.kind === 'goodsPurchase')).toHaveLength(2);
  });

  it('keeps the original slot when storage fails and reads legacy slot metadata', () => {
    const original = JSON.stringify({ ...new StationSimulation().exportSave(), version: '0.7.4' });
    const data = new Map([['azs-simulator-slot-1', original]]);
    let storageFull = false;
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (storageFull) throw new Error('storage full');
        data.set(key, value);
      },
      removeItem: (key: string) => data.delete(key),
    });
    try {
      const engine = new GameEngine();
      expect(engine.getSlot(1)?.savedAt).toBeUndefined();
      expect(engine.getSlot(2)).toBeNull();
      storageFull = true;
      expect(engine.saveSlot(1)).toBe(false);
      expect(data.get('azs-simulator-slot-1')).toBe(original);
      storageFull = false;
      expect(engine.saveSlot(1)).toBe(true);
      expect(engine.getSlot(1)?.savedAt).toBeGreaterThan(0);
      expect(engine.loadSlot(1)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fills all ten bays without overlap and exits a reserved bay after reloading', () => {
    const sim = new StationSimulation(15, cloneLegacyStation());
    sim.openVenue('shop');
    const save = sim.exportSave();
    save.nextSpawnSeconds = Infinity;
    const busyShop = save.state.commerce!.venues.shop;
    busyShop.serving = -999;
    busyShop.serviceRemaining = 100_000;
    let test = StationSimulation.importSave(save);
    const entry = ROAD_NODES.find(node => node.id === 'parking_entry')!;
    for (const [slot, bay] of PARKING_SLOTS.entries()) {
      const vehicle = {
        id: 1000 + slot, modelId: slot % 2 ? 'family-sedan' : 'compact-crossover',
        category: 'sedan', color: 0xffffff, status: 'toParking', parkSlot: slot,
        x: entry.x, y: entry.y, angle: Math.PI, speed: 0, westbound: true, wantsShop: true,
        route: [`parking_access_${slot}`, `parking_${slot}`], routeIndex: 0,
      } as Vehicle;
      test.vehicles.push(vehicle);
      test.commerce.parking[slot] = vehicle.id;
      for (let i = 0; i < 400 && vehicle.status !== 'parked'; i++) test.step(3);
      expect(vehicle).toMatchObject({ status: 'parked', x: bay.x, y: bay.y, angle: bay.angle });
      expect(footprintBlocked(vehicle, bay.x, bay.y, bay.angle, test.vehicles)).toBe(false);
      test.commerce.customers[vehicle.id].patience = 100_000;
    }
    expect(test.commerce.parking.every(id => id !== null)).toBe(true);

    const leaving = {
      id: 3000, modelId: 'budget-sedan', category: 'sedan', status: 'leaving',
      x: 820, y: 650, angle: Math.PI, speed: 0, westbound: true,
      route: ['exit_lane', 'exit', 'exit_merge', 'west_lane_1_west'], routeIndex: 0,
    } as Vehicle;
    test.vehicles.push(leaving);
    const departed = test.stats.departed;
    for (let i = 0; i < 500 && test.vehicles.includes(leaving); i++) test.step(3);
    expect(test.stats.departed, JSON.stringify(leaving)).toBe(departed + 1);

    const truck = {
      id: 2000, modelId: 'semi-trailer', category: 'truck', status: 'toParking',
      parkSlot: PARKING_SLOTS.length, x: 595, y: 590, angle: Math.PI, speed: 0,
      westbound: true, wantsShop: true,
      route: ['truck_parking_access', 'truck_parking'], routeIndex: 0,
    } as Vehicle;
    test.vehicles.push(truck);
    test.commerce.truckParking = truck.id;
    for (let i = 0; i < 1000 && truck.status !== 'parked'; i++) test.step(3);
    expect(truck).toMatchObject({ status:'parked', x: TRUCK_BAY.x, y: TRUCK_BAY.y });
    expect(footprintBlocked(truck, truck.x, truck.y, truck.angle, test.vehicles)).toBe(false);

    test = StationSimulation.importSave(test.exportSave());
    test.commerce.customers[1003].patience = 0;
    test.commerce.customers[2000].patience = 0;
    for (let i = 0; i < 100 && (test.commerce.parking[3] !== null || test.commerce.truckParking !== undefined); i++) test.step(30);
    expect(test.commerce.parking[3]).toBeNull();
    expect(test.commerce.truckParking).toBeUndefined();
    expect(test.commerce.parking.filter(id => id !== null)).toHaveLength(9);
  });
});
