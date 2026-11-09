import { getTrafficMultiplier, INITIAL_GAME_SECONDS } from './time';

export interface VehiclePosition {
  id: number;
  x: number;
  y: number;
  angle: number;
  color: number;
  visiting: boolean;
}

type Waypoint = readonly [seconds: number, x: number, y: number];

const SPAWN_INTERVAL = 210;
const ROAD_DURATION = 900;
const VISIT_DURATION = 1600;
const COLORS = [0x4eabe0, 0xe3bc52, 0xe56859, 0x83ca79, 0xc8b4e8, 0xe9eee1] as const;

function random(index: number): number {
  let value = (index + 1) * 0x9e3779b1;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

function routePosition(route: readonly Waypoint[], elapsed: number): { x: number; y: number; angle: number } {
  for (let i = 1; i < route.length; i++) {
    const [endTime, endX, endY] = route[i];
    const [startTime, startX, startY] = route[i - 1];
    if (elapsed > endTime && i < route.length - 1) continue;
    const duration = endTime - startTime;
    const fraction = duration > 0 ? Math.max(0, Math.min(1, (elapsed - startTime) / duration)) : 0;
    const dx = endX - startX;
    const dy = endY - startY;
    return {
      x: startX + dx * fraction,
      y: startY + dy * fraction,
      angle: dx === 0 && dy === 0 ? Math.atan2(18, 120) : Math.atan2(dx * 18 + dy * 80, dx * 120 - dy * 110),
    };
  }
  return { x: route[0][1], y: route[0][2], angle: 0 };
}

function vehicleRoute(visiting: boolean, westbound: boolean, pump: number): readonly Waypoint[] {
  if (!visiting) return westbound
    ? [[0, 10.8, 8], [ROAD_DURATION, -1.2, 8]]
    : [[0, -1.2, 6.75], [ROAD_DURATION, 10.8, 6.75]];

  const pumpX = pump === 0 ? 2.05 : 4.3;
  return [
    [0, -1.2, 6.75], [250, 1.7, 6.75], [420, 1.7, 5.35],
    [570, pumpX, 4.2], [860, pumpX, 4.2],
    [1040, 4.5, 5.4], [1230, 6.25, 6.75], [VISIT_DURATION, 10.8, 6.75],
  ];
}

/** Vehicle positions depend only on game time, so pausing and frame rate cannot change traffic. */
export function getVehicles(gameSeconds: number): VehiclePosition[] {
  const latest = Math.floor((gameSeconds - INITIAL_GAME_SECONDS) / SPAWN_INTERVAL);
  if (latest < 0) return [];
  const vehicles: VehiclePosition[] = [];
  for (let id = Math.max(0, latest - Math.ceil(VISIT_DURATION / SPAWN_INTERVAL)); id <= latest; id++) {
    const startedAt = INITIAL_GAME_SECONDS + id * SPAWN_INTERVAL;
    const traffic = getTrafficMultiplier(startedAt);
    if (id !== 0 && random(id * 5) >= Math.min(0.94, 0.3 + traffic * 0.5)) continue;
    const visiting = random(id * 5 + 1) < 0.29;
    const westbound = !visiting && random(id * 5 + 2) < 0.45;
    const duration = visiting ? VISIT_DURATION : ROAD_DURATION;
    const elapsed = gameSeconds - startedAt;
    if (elapsed < 0 || elapsed >= duration) continue;
    const position = routePosition(vehicleRoute(visiting, westbound, id % 2), elapsed);
    vehicles.push({ id, ...position, color: COLORS[id % COLORS.length], visiting });
  }
  return vehicles;
}
