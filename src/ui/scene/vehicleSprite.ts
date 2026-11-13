import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Vehicle } from '../../game/domain/types';
import { modelById } from '../../game/domain/vehicleModels';
import { metres } from '../../game/domain/world';
import { VEHICLE_SPRITES } from './vehicleManifest';

export interface VehicleVisual { root: Container; update: (vehicle: Vehicle) => void }
const textures = new Map<string,Texture>();
function subtleTint(color:number):number {
  const channel=(shift:number)=>Math.round(160+((color>>shift)&255)*.37);
  return (channel(16)<<16)|(channel(8)<<8)|channel(0);
}
export function setVehicleTextures(loaded:ReadonlyMap<string,Texture>):void {
  textures.clear();
  for(const item of VEHICLE_SPRITES){
    const texture=loaded.get(item.modelId);
    if(!texture)throw new Error(`Missing texture for ${item.modelId}`);
    textures.set(item.modelId,texture);
  }
}
/** Texture size never changes gameplay geometry or collision bounds. */
export function createVehicleVisual(vehicle: Vehicle): VehicleVisual {
  const model=modelById(vehicle.modelId),length=metres(model.length),width=metres(model.width);
  const root=new Container();
  root.addChild(new Graphics().ellipse(4,6,length*.51,width*.48).fill({color:0x071317,alpha:.28}));
  const texture=textures.get(model.id);
  if(texture){
    const sprite=new Sprite(texture);sprite.anchor.set(.5);
    sprite.width=length;sprite.height=width;
    if(model.category!=='truck')sprite.tint=subtleTint(vehicle.color);
    root.addChild(sprite);
  } else root.addChild(new Graphics().roundRect(-length/2,-width/2,length,width,8).fill(vehicle.color));
  return {root,update(next){root.position.set(next.x,next.y);root.rotation=next.angle;}};
}
