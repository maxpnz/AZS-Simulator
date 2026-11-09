import { describe, expect, it } from 'vitest';
import { INITIAL_GAME_SECONDS } from './time';
import { getVehicles } from './traffic';

describe('traffic simulation', () => {
  it('moves vehicles from game time alone and lets visits finish', () => {
    const first = getVehicles(INITIAL_GAME_SECONDS)[0];
    const later = getVehicles(INITIAL_GAME_SECONDS + 100).find((vehicle) => vehicle.id === first.id);
    expect(later).toBeDefined();
    expect(later?.x).not.toBe(first.x);
    expect(getVehicles(INITIAL_GAME_SECONDS + 1600).some((vehicle) => vehicle.id === first.id)).toBe(false);
    expect(getVehicles(INITIAL_GAME_SECONDS + 100)).toEqual(getVehicles(INITIAL_GAME_SECONDS + 100));
  });

  it('has less traffic late at night than during the morning rush', () => {
    const count = (start: number) => Array.from({ length: 24 }, (_, index) => getVehicles(start + index * 300).length)
      .reduce((sum, vehicles) => sum + vehicles, 0);
    expect(count(8 * 3600)).toBeGreaterThan(count(23 * 3600));
  });
});
