import type { Vehicle } from './types';
import { vehicleFillerPoint } from './stationGeometry';
export const STORE_DOOR={x:970,y:332};
const WALKWAY_Y=558;
export function driverWalkSeconds(vehicle:Vehicle):number {return Math.max(8,Math.round((Math.abs(vehicle.x+24-STORE_DOOR.x)+Math.abs(vehicle.y-22-WALKWAY_Y)+WALKWAY_Y-STORE_DOOR.y)/35));}
export function driverPose(vehicle:Vehicle):{x:number;y:number;visible:boolean;walking:boolean}{
  const phase=vehicle.servicePhase;
  const start={x:vehicle.x+24,y:vehicle.y-22};
  if(!phase||phase==='paying')return {...start,visible:false,walking:false};
  if(phase==='exiting'||phase==='boarding')return {...start,visible:true,walking:false};
  if(phase==='preparing'||phase==='dispensing'){const filler=vehicleFillerPoint(vehicle);return {x:filler.x,y:filler.y-18,visible:true,walking:false};}
  const duration=driverWalkSeconds(vehicle);
  const progress=Math.max(0,Math.min(1,1-(vehicle.phaseRemainingSeconds??duration)/duration));
  const p=phase==='returning'?1-progress:progress;
  const a=Math.abs(start.y-WALKWAY_Y),b=Math.abs(start.x-STORE_DOOR.x),c=WALKWAY_Y-STORE_DOOR.y,total=a+b+c;
  const distance=p*total;
  const position=distance<a?{x:start.x,y:start.y+(WALKWAY_Y-start.y)*distance/Math.max(1,a)}:
    distance<a+b?{x:start.x+(STORE_DOOR.x-start.x)*(distance-a)/Math.max(1,b),y:WALKWAY_Y}:
    {x:STORE_DOOR.x,y:WALKWAY_Y-(distance-a-b)};
  return {...position,visible:true,walking:true};
}
