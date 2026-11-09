import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { Vehicle } from '../../game/domain/types';

const WIDTH = { compact: 80, sedan: 88, crossover: 94, suv: 100, van: 106, truck: 132 } as const;

function lighten(color: number): number {
  const channel = (shift: number) => Math.min(255, Math.round(170 + ((color >> shift) & 255) * .32));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

export interface VehicleVisual {
  root: Container;
  update: (vehicle: Vehicle) => void;
}

/** Raster vehicles share the world coordinate system with the road network. */
export function createVehicleVisual(vehicle: Vehicle, carTexture: Texture, truckTexture: Texture): VehicleVisual {
  const root = new Container();
  const body = new Sprite(vehicle.category === 'truck' ? truckTexture : carTexture);
  body.anchor.set(.5);
  body.width = WIDTH[vehicle.category];
  body.height = vehicle.category === 'truck' ? 56 : WIDTH[vehicle.category] * .45;
  if (vehicle.category !== 'truck') body.tint = lighten(vehicle.color);
  root.addChild(body);
  const shadow = new Graphics().ellipse(0, 6, body.width * .43, body.height * .3).fill({ color: 0x061117, alpha: .24 });
  root.addChildAt(shadow, 0);
  const progress = new Graphics();
  progress.y = -31;
  root.addChild(progress);
  const amount = new Text({ text: '', style: { fontFamily: 'Arial', fontSize: 12, fontWeight: 'bold', fill: 0xffffff,
    stroke: { color: 0x102027, width: 3 } } });
  amount.anchor.set(.5);
  amount.y = -43;
  root.addChild(amount);
  return { root, update(next) {
    root.position.set(next.x, next.y);
    root.rotation = next.status === 'fueling' ? 0 : next.angle;
    const filling = next.status === 'fueling';
    progress.visible = filling;
    amount.visible = filling;
    if (filling) {
      const ratio = next.reservedMl > 0 ? Math.min(1, next.deliveredMl / next.reservedMl) : 0;
      progress.clear().roundRect(-31, -4, 62, 8, 3).fill({ color: 0x142329, alpha: .9 })
        .roundRect(-29, -2, 58 * ratio, 4, 2).fill(0x72e3a3);
      amount.text = (next.deliveredMl / 1000).toFixed(1) + ' л';
    }
  } };
}
