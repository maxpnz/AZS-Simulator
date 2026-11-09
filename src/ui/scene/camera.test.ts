import { describe, expect, it } from 'vitest';
import { cameraTransform, INITIAL_CAMERA, limitPan, zoomAround } from './camera';

const viewport = { x: 800, y: 400 };
const scene = { x: 1100, y: 620 };
const baseScale = 400 / 620;

describe('pinch camera', () => {
  it('keeps the point between fingers in place while zooming', () => {
    const point = { x: 300, y: 210 };
    const before = cameraTransform(INITIAL_CAMERA, baseScale, viewport, scene);
    const worldX = (point.x - before.x) / before.scale;
    const worldY = (point.y - before.y) / before.scale;
    const camera = zoomAround(INITIAL_CAMERA, 2, point, point, baseScale, viewport, scene);
    const after = cameraTransform(camera, baseScale, viewport, scene);
    expect(after.x + worldX * after.scale).toBeCloseTo(point.x);
    expect(after.y + worldY * after.scale).toBeCloseTo(point.y);
  });

  it('limits zoom and dragging', () => {
    const camera = zoomAround(INITIAL_CAMERA, 100, { x: 400, y: 200 }, { x: 400, y: 200 }, baseScale, viewport, scene);
    expect(camera.zoom).toBe(3.5);
    expect(limitPan({ ...camera, panX: 10000, panY: -10000 }, baseScale, viewport, scene).panX).toBeLessThan(10000);
  });
});
