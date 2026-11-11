import { describe, expect, it } from 'vitest';
import { cloneLegacyStation } from '../domain/config';
import { StationSimulation } from './StationSimulation';

describe('v0.3 traffic regression', () => {
  it('does not leave cars stranded across the internal road', () => {
    const sim = new StationSimulation(12345, cloneLegacyStation());
    const positions = new Map<number,{x:number;y:number;stale:number}>();
    let longest = 0;
    for(let tick=0;tick<18000;tick++){
      sim.step(tick>=9000&&tick<9300?30:3);
      for(const car of sim.vehicles){
        if(car.status==='fueling'||car.status==='finishing'||car.status==='queued')continue;
        const previous=positions.get(car.id);
        const stale=previous&&Math.hypot(car.x-previous.x,car.y-previous.y)<0.01?previous.stale+(tick>=9000&&tick<9300?30:3):0;
        positions.set(car.id,{x:car.x,y:car.y,stale});
        longest=Math.max(longest,stale);
      }
      for(const id of positions.keys())if(!sim.vehicles.some(v=>v.id===id))positions.delete(id);
    }
    expect(longest).toBeLessThan(1_500);
  },30000);
});
