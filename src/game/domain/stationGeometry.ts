import type { FuelId, Pump, Vehicle } from './types';
import { modelById } from './vehicleModels';
import { CANOPY_SUPPORTS, metres, PUMP_SLOTS } from './world';

export interface WorldPoint { x:number; y:number }
export interface WorldRect extends WorldPoint { width:number; height:number }
export const TANK_PAD:WorldRect={x:1275,y:160,width:370,height:165};
export const DELIVERY_PAD:WorldRect={x:1680,y:160,width:250,height:165};
export const FUEL_HATCH_SIZE=32;
export const PUMP_ISLANDS=CANOPY_SUPPORTS.map((x,index)=>({index,x,y:540,width:190,height:38}));
export const FUEL_SHORT:Record<FuelId,string>={ai92:'92',ai95:'95',ai95plus:'95+',ai98:'98',ai100:'100',diesel:'ДТ'};

export function tankHatchPoint(index:number):WorldPoint {
  return {x:TANK_PAD.x+47+(index%4)*91,y:TANK_PAD.y+60+Math.floor(index/4)*69};
}
export function vehicleFillerPoint(vehicle:Pick<Vehicle,'modelId'|'x'|'y'|'angle'>):WorldPoint {
  const filler=modelById(vehicle.modelId).filler;
  const localX=metres(filler.x),localY=metres(filler.y);
  const c=Math.cos(vehicle.angle),s=Math.sin(vehicle.angle);
  return {x:vehicle.x+localX*c-localY*s,y:vehicle.y+localX*s+localY*c};
}
export function pumpNozzlePoint(pump:Pump,fuel:FuelId):WorldPoint|null {
  const slot=PUMP_SLOTS[pump.slot];
  const index=pump.fuels.indexOf(fuel);
  if(index<0||index>3)return null;
  return {x:slot.x+pumpChannelX(index,Math.min(4,pump.fuels.length)),y:slot.y+13};
}
export function pumpChannelX(index:number,count:number):number {
  return (index-(count-1)/2)*12;
}
export function connectedPumpChannels(pump:Pump,stock:Record<FuelId,number>) {
  return pump.fuels.slice(0,4).map(fuel=>({fuel,label:FUEL_SHORT[fuel],available:stock[fuel]>0}));
}
