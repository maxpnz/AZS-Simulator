import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js';
import stationBackground from '../../assets/station-concept-v011.png';
import type { Pump } from '../../game/domain/types';
import { getHour } from '../../game/simulation/time';
import { getVehicles } from '../../game/simulation/traffic';
import { createVehicleSprite } from './vehicleSprite';

export const SCENE_WIDTH = 1672;
export const SCENE_HEIGHT = 941;

function project(x: number, y: number): { x: number; y: number } {
  // Fixed world-to-art projection. Traffic remains simulation data, independent of the background image.
  return { x: 988 + 120 * x - 110 * y, y: 180 + 18 * x + 80 * y };
}

function pumpMarker(slot: number): Container {
  const marker = new Container();
  const x = slot === 0 ? 749 : slot === 1 ? 1045 : 660 + (slot % 4) * 150;
  const y = slot < 2 ? 436 : 430 + Math.floor(slot / 4) * 104;
  marker.position.set(x, y);
  if (slot >= 2) {
    marker.addChild(new Graphics().roundRect(-23, -20, 46, 48, 5).fill(0xd4e3e0));
    marker.addChild(new Graphics().roundRect(-24, -27, 48, 27, 3).fill(0xc72c24));
  }
  const badge = new Text({ text: String(slot + 1), style: { fontFamily: 'Arial', fontSize: 16, fontWeight: 'bold', fill: 0xffffff } });
  badge.anchor.set(0.5);
  badge.position.set(0, -13);
  marker.addChild(badge);
  return marker;
}

export interface StationScene {
  root: Container;
  setTime: (gameSeconds: number) => void;
}

export async function createStationScene(pumps: readonly Pump[]): Promise<StationScene> {
  const root = new Container();
  const background = new Sprite(await Assets.load(stationBackground));
  background.width = SCENE_WIDTH;
  background.height = SCENE_HEIGHT;
  root.addChild(background);

  const pumpLayer = new Container();
  for (const pump of pumps) pumpLayer.addChild(pumpMarker(pump.slot));
  root.addChild(pumpLayer);

  const vehicleLayer = new Container();
  const vehicleSprites = new Map<number, Container>();
  root.addChild(vehicleLayer);

  const daylightWash = new Graphics().rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(0xfff3cf);
  const night = new Graphics().rect(0, 0, SCENE_WIDTH, SCENE_HEIGHT).fill(0x081729);
  root.addChild(daylightWash, night);

  return {
    root,
    setTime(gameSeconds) {
      const vehicles = getVehicles(gameSeconds);
      const active = new Set(vehicles.map((vehicle) => vehicle.id));
      for (const [id, sprite] of vehicleSprites) {
        if (!active.has(id)) {
          vehicleLayer.removeChild(sprite);
          sprite.destroy({ children: true });
          vehicleSprites.delete(id);
        }
      }
      for (const vehicle of vehicles) {
        let sprite = vehicleSprites.get(vehicle.id);
        if (!sprite) {
          sprite = createVehicleSprite(vehicle.color);
          sprite.scale.set(2.4);
          vehicleSprites.set(vehicle.id, sprite);
          vehicleLayer.addChild(sprite);
        }
        const point = project(vehicle.x, vehicle.y);
        sprite.position.set(point.x, point.y);
        sprite.rotation = vehicle.angle;
      }
      const hour = getHour(gameSeconds);
      const daylight = Math.max(0, Math.sin(((hour - 5) / 14) * Math.PI));
      daylightWash.alpha = daylight * 0.16;
      night.alpha = 0.64 * (1 - daylight);
    },
  };
}
