/** All gameplay dimensions are metres. The renderer uses 20 screen units per metre. */
export const WORLD_SCALE = 20;
export const metres = (value: number) => value * WORLD_SCALE;
export const CANOPY_SUPPORTS = [680, 930, 1180, 1430, 1680] as const;
export const PUMP_SLOTS = CANOPY_SUPPORTS.flatMap((x, support) => [
  { slot: support * 2, support, side: 'left' as const, x: x - 54, y: 526, stopX: x - 54, stopY: 590 },
  { slot: support * 2 + 1, support, side: 'right' as const, x: x + 54, y: 526, stopX: x + 54, stopY: 590 },
]);
export const ROAD_LANES = [885, 975, 1105, 1170] as const;
export const WORLD_OBSTACLES = [
  { id: 'shop', x: 475, y: 95, width: 670, height: 280 },
  { id: 'flower-west', x: 300, y: 425, width: 180, height: 90 },
  { id: 'flower-east', x: 1690, y: 425, width: 130, height: 90 },
  ...CANOPY_SUPPORTS.map((x, index) => ({ id: `support-${index}`, x: x - 12, y: 455, width: 24, height: 92 })),
];
export function pumpSlot(slot: number) { return PUMP_SLOTS[slot]; }
