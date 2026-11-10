import { expect, it } from 'vitest';
import { cloneLegacyStation } from '../domain/config';
import { roadContainsPoint } from '../domain/roadNetwork';
import { vehicleFootprint } from './collisions';
import { StationSimulation } from './StationSimulation';

function footprintOnRoad(sim:StationSimulation):void {
  for(const vehicle of sim.vehicles){
    if(vehicle.status==='road'){
      const direction=Math.cos(vehicle.angle);
      expect(vehicle.westbound?direction<0:direction>0,`${vehicle.modelId} on ${vehicle.laneId} facing ${vehicle.angle}`).toBe(true);
    }
    const box=vehicleFootprint(vehicle),cos=Math.cos(box.angle),sin=Math.sin(box.angle);
    for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      const cx=box.x+x*box.length/2*cos-y*box.width/2*sin;
      const cy=box.y+x*box.length/2*sin+y*box.width/2*cos;
      if(cx<0||cx>2000)continue; // vehicles enter and leave at the world edge
      expect(roadContainsPoint(cx,cy),`${vehicle.modelId} ${vehicle.status} at ${cx},${cy}`).toBe(true);
    }
  }
}

it('keeps full vehicle footprints on the rendered road at 1× and 10×',()=>{
  for(const seconds of [3,30]){
    const sim=new StationSimulation(12345,cloneLegacyStation());
    for(let step=0;step<(seconds===3?9000:1000);step++){
      sim.step(seconds);
      footprintOnRoad(sim);
    }
  }
},30000);
