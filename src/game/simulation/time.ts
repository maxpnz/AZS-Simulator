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
  [0, 0.25], [5, 0.22], [7, 0.8], [8, 1.65], [9, 1.0], [13, 1.0],
  [16, 1.05], [18, 1.7], [19, 1.2], [22, 0.4], [24, 0.25],
];
const WEEKEND_CURVE: readonly [number,number][] = [
  [0,.35],[5,.27],[7,.45],[9,.72],[11,1.18],[14,1.38],[16,1.32],
  [18,1.35],[19,1.12],[22,.55],[24,.35],
];

export function getTrafficMultiplier(gameSeconds: number): number {
  const hour = getHour(gameSeconds);
  const day=Math.floor(gameSeconds/SECONDS_PER_DAY);
  const curve=day%7>=5?WEEKEND_CURVE:TRAFFIC_CURVE;
  const nextIndex = curve.findIndex(([pointHour]) => pointHour >= hour);
  if (nextIndex <= 0) return curve[0][1];
  const [fromHour, fromValue] = curve[nextIndex - 1];
  const [toHour, toValue] = curve[nextIndex];
  const t = (hour - fromHour) / (toHour - fromHour);
  const eased = t * t * (3 - 2 * t);
  const block=Math.floor(gameSeconds/(3*3600));
  const variation=(index:number)=>(((Math.imul(index+1,2654435761)>>>0)%1000)/1000-.5)*.24;
  const phase=(gameSeconds/(3*3600))-block;
  const noise=variation(block)*(1-phase)+variation(block+1)*phase;
  return (fromValue + (toValue - fromValue) * eased)*(1+noise);
}

export type DayPhase = 'Ночь' | 'Утро' | 'День' | 'Вечер';

export function getDayPhase(gameSeconds: number): DayPhase {
  const hour = getHour(gameSeconds);
  if (hour < 5 || hour >= 22) return 'Ночь';
  if (hour < 10) return 'Утро';
  if (hour < 17) return 'День';
  return 'Вечер';
}
