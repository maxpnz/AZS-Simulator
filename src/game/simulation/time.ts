import type { ClockSnapshot } from '../domain/types';

export const SECONDS_PER_DAY = 24 * 60 * 60;
export const INITIAL_GAME_SECONDS = 7 * 3600;

export function getClock(gameSeconds: number): ClockSnapshot {
  const wholeSeconds = Math.floor(Math.max(0, gameSeconds));
  const daySeconds = wholeSeconds % SECONDS_PER_DAY;
  return {
    gameSeconds,
    day: Math.floor(wholeSeconds / SECONDS_PER_DAY) + 1,
    hour: Math.floor(daySeconds / 3600),
    minute: Math.floor((daySeconds % 3600) / 60),
  };
}

export function getHour(gameSeconds: number): number {
  return ((gameSeconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY / 3600;
}

// Cyclic control points keep demand continuous at midnight and make rush hours gradual.
const TRAFFIC_CURVE: readonly [number, number][] = [
  [0, 0.28], [4, 0.2], [6, 0.45], [8, 1.3], [10, 0.85],
  [13, 0.95], [16, 1.05], [18, 1.45], [20, 0.9], [22, 0.48], [24, 0.28],
];

export function getTrafficMultiplier(gameSeconds: number): number {
  const hour = getHour(gameSeconds);
  const nextIndex = TRAFFIC_CURVE.findIndex(([pointHour]) => pointHour >= hour);
  if (nextIndex <= 0) return TRAFFIC_CURVE[0][1];
  const [fromHour, fromValue] = TRAFFIC_CURVE[nextIndex - 1];
  const [toHour, toValue] = TRAFFIC_CURVE[nextIndex];
  const t = (hour - fromHour) / (toHour - fromHour);
  const eased = t * t * (3 - 2 * t);
  return fromValue + (toValue - fromValue) * eased;
}

export type DayPhase = 'Ночь' | 'Утро' | 'День' | 'Вечер';

export function getDayPhase(gameSeconds: number): DayPhase {
  const hour = getHour(gameSeconds);
  if (hour < 5 || hour >= 22) return 'Ночь';
  if (hour < 10) return 'Утро';
  if (hour < 17) return 'День';
  return 'Вечер';
}
