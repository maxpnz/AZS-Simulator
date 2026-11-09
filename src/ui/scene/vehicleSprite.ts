import { Container, Graphics } from 'pixi.js';

/** Compact vector car, drawn once and moved by the simulation clock. */
export function createVehicleSprite(color: number): Container {
  const car = new Container();
  car.addChild(new Graphics().ellipse(1, 5, 21, 10).fill({ color: 0x142525, alpha: 0.28 }));
  car.addChild(new Graphics()
    .roundRect(-16, -10, 7, 5, 1).fill(0x19272a)
    .roundRect(8, -10, 7, 5, 1).fill(0x19272a)
    .roundRect(-16, 6, 7, 5, 1).fill(0x19272a)
    .roundRect(8, 6, 7, 5, 1).fill(0x19272a));
  car.addChild(new Graphics().roundRect(-18, -8, 36, 16, 6).fill(color).stroke({ color: 0x193538, width: 1 }));
  car.addChild(new Graphics().roundRect(-7, -7, 15, 14, 4).fill(0x9bc0c5));
  car.addChild(new Graphics().rect(-1, -7, 2, 14).fill({ color: 0x294851, alpha: 0.55 }));
  car.addChild(new Graphics()
    .roundRect(14, -6, 4, 4, 1).fill(0xfff4c1)
    .roundRect(14, 2, 4, 4, 1).fill(0xfff4c1)
    .roundRect(-18, -6, 3, 4, 1).fill(0xe86358)
    .roundRect(-18, 2, 3, 4, 1).fill(0xe86358));
  return car;
}
