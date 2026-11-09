import { describe, expect, it } from 'vitest';
import { createVehicle, RandomSource, passengerTrafficMultiplier } from './traffic';
describe('traffic data utilities reserved for later stages', () => {
  it('creates deterministic vehicle data without running sales', () => {
    expect(createVehicle(1, 8*3600, new RandomSource(42))).toEqual(createVehicle(1, 8*3600, new RandomSource(42)));
  });
  it('has less potential traffic late at night than during the morning rush', () => {
    expect(passengerTrafficMultiplier(8*3600)).toBeGreaterThan(passengerTrafficMultiplier(23*3600));
  });
});
