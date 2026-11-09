import { Container, Graphics, Text } from 'pixi.js';
import type { Pump } from '../../game/domain/types';
import { getHour } from '../../game/simulation/time';

export const SCENE_WIDTH = 1100;
export const SCENE_HEIGHT = 620;

type Point = [number, number];
const iso = (x: number, y: number, z = 0): Point => [550 + (x - y) * 48, 120 + (x + y) * 24 - z];

function quad(parent: Container, points: Point[], color: number, stroke?: number): Graphics {
  const graphic = new Graphics().poly(points.flat()).fill(color);
  if (stroke !== undefined) graphic.stroke({ color: stroke, width: 2 });
  parent.addChild(graphic);
  return graphic;
}

function box(parent: Container, x: number, y: number, width: number, depth: number, height: number, top: number, left: number, right: number): void {
  const b = iso(x + width, y), c = iso(x + width, y + depth), d = iso(x, y + depth);
  const at = iso(x, y, height), bt = iso(x + width, y, height), ct = iso(x + width, y + depth, height), dt = iso(x, y + depth, height);
  quad(parent, [d, c, ct, dt], left);
  quad(parent, [b, c, ct, bt], right);
  quad(parent, [at, bt, ct, dt], top);
}

function label(parent: Container, text: string, x: number, y: number, size = 13, color = 0xeaf5f1): Text {
  const item = new Text({ text, style: { fontFamily: 'Arial, sans-serif', fontSize: size, fontWeight: 'bold', fill: color, letterSpacing: 1 } });
  item.anchor.set(0.5);
  item.position.set(x, y);
  parent.addChild(item);
  return item;
}

function drawPump(parent: Container, pump: Pump): void {
  const col = pump.slot % 4;
  const row = Math.floor(pump.slot / 4);
  const x = 1.55 + col * 1.75;
  const y = 3.1 + row * 1.5;
  quad(parent, [iso(x - 0.45, y - 0.4), iso(x + 0.65, y - 0.4), iso(x + 0.65, y + 0.46), iso(x - 0.45, y + 0.46)], 0x7a8a89);
  box(parent, x - 0.16, y - 0.13, 0.42, 0.38, 36, 0xe7f0e9, 0xbccbc7, 0x809592);
  const [sx, sy] = iso(x + 0.1, y + 0.12, 19);
  const display = new Graphics().roundRect(sx - 9, sy - 7, 18, 12, 2).fill(0x183940);
  parent.addChild(display);
  const [nx, ny] = iso(x + 0.24, y + 0.16, 13);
  parent.addChild(new Graphics().circle(nx, ny, 3).fill(0x29d6a0));
  const [lx, ly] = iso(x + 0.07, y + 0.65);
  label(parent, `0${pump.slot + 1}`, lx, ly + 8, 12, 0xeff7ef);
}

export interface StationScene {
  root: Container;
  setTime: (gameSeconds: number) => void;
}

export function createStationScene(pumps: readonly Pump[]): StationScene {
  const root = new Container();
  root.addChild(new Graphics().rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(0x24433e));

  // Grass and distant service roads make the station footprint readable.
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 15; col++) {
      if ((row * 13 + col * 7) % 5 !== 0) continue;
      const x = 95 + col * 68 + (row % 2) * 24;
      const y = 70 + row * 79;
      root.addChild(new Graphics().circle(x, y, 2 + (col % 3)).fill({ color: 0x3c7160, alpha: 0.6 }));
    }
  }

  quad(root, [iso(-0.7, 6.15), iso(10, 6.15), iso(10, 8.8), iso(-0.7, 8.8)], 0x243943);
  quad(root, [iso(-0.7, 7.25), iso(10, 7.25), iso(10, 7.35), iso(-0.7, 7.35)], 0xb4b993);
  for (let x = 0; x < 9; x += 1.6) {
    quad(root, [iso(x, 7.26), iso(x + 0.75, 7.26), iso(x + 0.75, 7.34), iso(x, 7.34)], 0xe7d9a8);
  }

  quad(root, [iso(0, 0), iso(9, 0), iso(9, 6.5), iso(0, 6.5)], 0x93a7a2, 0xbac9b9);
  quad(root, [iso(0.25, 0.27), iso(8.75, 0.27), iso(8.75, 6.15), iso(0.25, 6.15)], 0x637b7c);
  // Parking and access markings.
  for (let x = 1.1; x < 8; x += 1.75) {
    quad(root, [iso(x, 5.58), iso(x + 0.75, 5.58), iso(x + 0.75, 5.63), iso(x, 5.63)], 0xc9d5c6);
  }
  quad(root, [iso(0.45, 0.45), iso(1.05, 0.45), iso(1.05, 2.25), iso(0.45, 2.25)], 0x5c9a70);
  quad(root, [iso(7.9, 0.45), iso(8.55, 0.45), iso(8.55, 2.2), iso(7.9, 2.2)], 0x5c9a70);

  // Shop: dark walls, glass storefront and a light roof.
  box(root, 2.1, 0.38, 4.7, 2.0, 79, 0xdbe8d8, 0x344f52, 0x243e45);
  const storeFront = [iso(2.4, 2.39, 12), iso(6.5, 2.39, 12), iso(6.5, 2.39, 59), iso(2.4, 2.39, 59)];
  quad(root, storeFront, 0x315e68);
  for (const x of [3.1, 4.4, 5.7]) {
    quad(root, [iso(x, 2.41, 14), iso(x + 0.06, 2.41, 14), iso(x + 0.06, 2.41, 57), iso(x, 2.41, 57)], 0x9dbab6);
  }
  box(root, 2, 0.28, 4.9, 2.13, 85, 0xf2f1df, 0xb7c7bd, 0x9dafaa);
  const [brandX, brandY] = iso(4.45, 1.35, 86);
  label(root, 'АЗС  ·  SIMULATOR', brandX, brandY + 2, 18, 0x123b3b);

  // Wide canopy and its support columns frame the forecourt.
  for (const [x, y] of [[1.1, 3.0], [8.15, 3.0], [1.1, 5.5], [8.15, 5.5]]) {
    box(root, x, y, 0.13, 0.13, 64, 0xcbd9cf, 0x92aba4, 0x78938e);
  }
  pumps.forEach((pump) => drawPump(root, pump));
  // A light roof plane suggests cover while leaving the pump configuration legible.
  const roof = quad(root, [iso(0.85, 2.72, 72), iso(8.4, 2.72, 72), iso(8.4, 5.8, 72), iso(0.85, 5.8, 72)], 0xdde9de);
  roof.alpha = 0.13;
  quad(root, [iso(0.85, 5.8, 61), iso(8.4, 5.8, 61), iso(8.4, 5.8, 72), iso(0.85, 5.8, 72)], 0x0c9d84);
  quad(root, [iso(8.4, 2.72, 61), iso(8.4, 5.8, 61), iso(8.4, 5.8, 72), iso(8.4, 2.72, 72)], 0x087963);
  const [canopyX, canopyY] = iso(4.6, 5.79, 45);
  label(root, 'АЗС', canopyX, canopyY, 17, 0xeafff4);

  const [signX, signY] = iso(8.35, 1.0);
  box(root, 8.25, 0.92, 0.13, 0.13, 84, 0xd8e8d8, 0x9ab2a9, 0x799690);
  const sign = new Graphics().roundRect(signX - 22, signY - 127, 45, 43, 4).fill(0x0f3e43);
  root.addChild(sign);
  label(root, 'АЗС', signX, signY - 107, 14, 0x5aefb7);

  const night = new Graphics().rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(0x081729);
  root.addChild(night);
  const lamps = new Container();
  for (const [x, y] of [[1.2, 3], [8, 3], [1.2, 5.5], [8, 5.5]]) {
    const [px, py] = iso(x, y, 65);
    const glow = new Graphics().circle(px, py + 25, 50).fill({ color: 0xffe6aa, alpha: 0.12 });
    lamps.addChild(glow);
    lamps.addChild(new Graphics().circle(px, py, 5).fill(0xffedc0));
  }
  root.addChild(lamps);

  return {
    root,
    setTime(gameSeconds) {
      const hour = getHour(gameSeconds);
      // Cosine places the darkest point near midnight and changes light continuously.
      const daylight = Math.max(0, Math.sin(((hour - 5) / 14) * Math.PI));
      night.alpha = 0.57 * (1 - daylight);
      lamps.alpha = Math.max(0, Math.min(1, (0.65 - daylight) / 0.4));
    },
  };
}
