import { describe, expect, it } from 'vitest';
import { ROAD_NODES } from './roadNetwork';
import { hitTest, HOTSPOTS, SCENE_HEIGHT, SCENE_WIDTH } from './createStationScene';
import { cameraTransform, limitPan } from './camera';

describe('v0.2-A world', () => {
  it('offers a continuous legal route through each pump and back to the station-side lane', () => {
    const nodes = new Map(ROAD_NODES.map((node) => [node.id,node]));
    for (const node of ROAD_NODES) for (const next of node.next) expect(nodes.has(next)).toBe(true);
    for (const pump of ['pump_1','pump_2']) {
      const reachable = (from:string,to:string,seen=new Set<string>()):boolean => {
        if(from===to) return true;
        if(seen.has(from)) return false;
        seen.add(from);
        return nodes.get(from)!.next.some((next)=>reachable(next,to,seen));
      };
      expect(reachable('entrance_decision',pump)).toBe(true);
      expect(reachable(pump,'exit_merge')).toBe(true);
    }
    expect(nodes.get('west_lane_1_east')!.next).not.toContain('entrance_curve');
    expect(nodes.get('west_lane_2_east')!.next).not.toContain('entrance_curve');
  });
  it('keeps all interactive areas inside the drawn world', () => {
    for (const area of HOTSPOTS) {
      const [x,y] = area.polygon[0];
      expect(x).toBeGreaterThan(0); expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(SCENE_WIDTH); expect(y).toBeLessThan(SCENE_HEIGHT);
      expect(hitTest(x+1,y+1)).toBe(area.id);
    }
  });
  it.each([[800,400],[1280,720],[640,360],[1920,1080]])('never exposes outside world at %i × %i', (width,height) => {
    const viewport={x:width,y:height},scene={x:SCENE_WIDTH,y:SCENE_HEIGHT};
    const base=Math.max(width/SCENE_WIDTH,height/SCENE_HEIGHT);
    for (const zoom of [1,2,3.5]) for (const panX of [-100000,100000]) for (const panY of [-100000,100000]) {
      const transform=cameraTransform(limitPan({zoom,panX,panY},base,viewport,scene),base,viewport,scene);
      expect(transform.x).toBeLessThanOrEqual(.001);
      expect(transform.y).toBeLessThanOrEqual(.001);
      expect(transform.x+scene.x*transform.scale).toBeGreaterThanOrEqual(width-.001);
      expect(transform.y+scene.y*transform.scale).toBeGreaterThanOrEqual(height-.001);
    }
  });
});
