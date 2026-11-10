import { modelById } from '../domain/vehicleModels';
import { metres, WORLD_OBSTACLES } from '../domain/world';
import type { Vehicle } from '../domain/types';
export interface Footprint {x:number;y:number;angle:number;length:number;width:number}
export function vehicleFootprint(vehicle:Vehicle,x=vehicle.x,y=vehicle.y,angle=vehicle.angle):Footprint {
  const model=modelById(vehicle.modelId);
  return {x,y,angle,length:metres(model.length),width:metres(model.width)};
}
function corners(box:Footprint):[number,number][] {
  const c=Math.cos(box.angle),s=Math.sin(box.angle),hx=box.length/2,hy=box.width/2;
  return [[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]].map(([x,y])=>[box.x+x*c-y*s,box.y+x*s+y*c]);
}
function overlaps(a:Footprint,b:Footprint,padding=0):boolean {
  const ca=corners(a),cb=corners(b);
  const axes=[a.angle,b.angle,a.angle+Math.PI/2,b.angle+Math.PI/2];
  return axes.every(angle=>{
    const x=Math.cos(angle),y=Math.sin(angle);
    const pa=ca.map(p=>p[0]*x+p[1]*y),pb=cb.map(p=>p[0]*x+p[1]*y);
    return Math.min(...pa)-padding<=Math.max(...pb)&&Math.min(...pb)-padding<=Math.max(...pa);
  });
}
export function footprintBlocked(vehicle:Vehicle,x:number,y:number,angle:number,others:readonly Vehicle[]):boolean {
  const next=vehicleFootprint(vehicle,x,y,angle);
  for(const obstacle of WORLD_OBSTACLES) {
    if(Math.abs(next.x-(obstacle.x+obstacle.width/2))>(next.length+obstacle.width)/2+15||Math.abs(next.y-(obstacle.y+obstacle.height/2))>(next.length+obstacle.height)/2+15)continue;
    const box={x:obstacle.x+obstacle.width/2,y:obstacle.y+obstacle.height/2,angle:0,length:obstacle.width,width:obstacle.height};
    if(overlaps(next,box,3))return true;
  }
  return others.some(other=>other.id!==vehicle.id&&Math.abs(other.x-x)<(next.length+metres(modelById(other.modelId).length))/2+20&&Math.abs(other.y-y)<(next.length+metres(modelById(other.modelId).length))/2+20&&overlaps(next,vehicleFootprint(other),5));
}
export function sweptBlocked(vehicle:Vehicle,x:number,y:number,angle:number,others:readonly Vehicle[]):boolean {
  const distance=Math.hypot(x-vehicle.x,y-vehicle.y),steps=Math.max(1,Math.ceil(distance/8));
  for(let i=1;i<=steps;i++) {
    const t=i/steps;
    if(footprintBlocked(vehicle,vehicle.x+(x-vehicle.x)*t,vehicle.y+(y-vehicle.y)*t,vehicle.angle+(angle-vehicle.angle)*t,others))return true;
  }
  return false;
}
