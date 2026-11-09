export interface Point { x: number; y: number }
export interface Camera { zoom: number; panX: number; panY: number }
export const INITIAL_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };
export function cameraTransform(camera: Camera, baseScale: number, viewport: Point, scene: Point) {
  const scale = baseScale * camera.zoom;
  return { scale, x: (viewport.x - scene.x * scale) / 2 + camera.panX, y: (viewport.y - scene.y * scale) / 2 + camera.panY };
}
export function zoomAround(camera: Camera, factor: number, before: Point, after: Point, baseScale: number, viewport: Point, scene: Point): Camera {
  const previous = cameraTransform(camera, baseScale, viewport, scene);
  const zoom = Math.max(1, Math.min(3.5, camera.zoom * factor));
  const scale = baseScale * zoom;
  return { zoom, panX: after.x - (viewport.x - scene.x * scale) / 2 - ((before.x - previous.x) / previous.scale) * scale,
    panY: after.y - (viewport.y - scene.y * scale) / 2 - ((before.y - previous.y) / previous.scale) * scale };
}
export function limitPan(camera: Camera, baseScale: number, viewport: Point, scene: Point): Camera {
  const scale = baseScale * camera.zoom;
  const xLimit = Math.max(0, (scene.x * scale - viewport.x) / 2);
  const yLimit = Math.max(0, (scene.y * scale - viewport.y) / 2);
  return { ...camera, panX: Math.max(-xLimit, Math.min(xLimit, camera.panX)), panY: Math.max(-yLimit, Math.min(yLimit, camera.panY)) };
}
