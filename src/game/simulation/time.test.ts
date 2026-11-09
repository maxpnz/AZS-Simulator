import { describe, expect, it } from 'vitest';
import { getClock, getTrafficMultiplier, SECONDS_PER_DAY } from './time';
import { GameEngine } from './GameEngine';
import { canPlacePump, isValidDeliveryCargo, isValidPumpFuels } from '../domain/config';

describe('game clock', () => {
  it('rolls into the next day', () => {
    expect(getClock(SECONDS_PER_DAY + 90 * 60)).toMatchObject({ day: 2, hour: 1, minute: 30 });
  });

  it('advances by fixed simulation steps and respects pause and speed', () => {
    const engine = new GameEngine();
    const start = engine.getSnapshot();
    engine.pulse(0);
    engine.pulse(1000);
    expect(engine.getSnapshot()).toBeCloseTo(start + 60, 5);
    engine.setControls(true, 1);
    engine.pulse(1500);
    expect(engine.getSnapshot()).toBeCloseTo(start + 60, 5);
    engine.setControls(false, 2);
    engine.pulse(1600);
    expect(engine.getSnapshot()).toBeCloseTo(start + 72, 5);
  });

  it('has continuous traffic at midnight and less traffic at night', () => {
    expect(getTrafficMultiplier(0)).toBeCloseTo(getTrafficMultiplier(SECONDS_PER_DAY), 8);
    expect(getTrafficMultiplier(8 * 3600)).toBeGreaterThan(getTrafficMultiplier(3 * 3600));
  });
});

describe('station configuration limits', () => {
  it('enforces fuel and delivery type limits', () => {
    expect(isValidPumpFuels(['ai92', 'ai95', 'diesel'])).toBe(true);
    expect(isValidPumpFuels(['ai92', 'ai95', 'diesel', 'ai98'])).toBe(false);
    expect(isValidDeliveryCargo({ ai92: 1000, ai95: 1000, diesel: 1000 })).toBe(true);
    expect(isValidDeliveryCargo({ ai92: 1000, ai95: 1000, diesel: 1000, ai98: 1000 })).toBe(false);
    expect(canPlacePump([{ id: 'pump-1', slot: 0, fuels: ['ai92'] }], 0)).toBe(false);
    expect(canPlacePump([{ id: 'pump-1', slot: 0, fuels: ['ai92'] }], 7)).toBe(true);
  });
});
