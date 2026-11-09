import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import type { Pump } from '../../game/domain/types';
import { createStationScene, SCENE_HEIGHT, SCENE_WIDTH } from './createStationScene';
import { cameraTransform, INITIAL_CAMERA, limitPan, zoomAround, type Camera, type Point } from './camera';

interface Props { pumps: readonly Pump[]; gameSeconds: number }

export function StationCanvas({ pumps, gameSeconds }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const updateTimeRef = useRef<(seconds: number) => void>(() => undefined);

  useEffect(() => { updateTimeRef.current(gameSeconds); }, [gameSeconds]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let removeGestures = () => undefined;

    async function mount() {
      await app.init({ width: SCENE_WIDTH, height: SCENE_HEIGHT, background: 0x1a211b, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
      if (disposed || !host) { app.destroy(true); return; }
      const scene = await createStationScene(pumps);
      if (disposed) { scene.root.destroy({ children: true }); app.destroy(true); return; }
      host.appendChild(app.canvas);
      app.stage.addChild(scene.root);
      updateTimeRef.current = scene.setTime;
      scene.setTime(gameSeconds);
      const sceneSize = { x: SCENE_WIDTH, y: SCENE_HEIGHT };
      const viewport = (): Point => ({ x: host.clientWidth, y: host.clientHeight });
      const baseScale = () => Math.max(host.clientWidth / SCENE_WIDTH, host.clientHeight / SCENE_HEIGHT);
      let camera: Camera = { ...INITIAL_CAMERA, panY: -24 };
      const applyCamera = () => {
        camera = limitPan(camera, baseScale(), viewport(), sceneSize);
        const transform = cameraTransform(camera, baseScale(), viewport(), sceneSize);
        scene.root.scale.set(transform.scale);
        scene.root.position.set(transform.x, transform.y);
      };
      const resize = () => {
        const width = host.clientWidth;
        const height = host.clientHeight;
        app.renderer.resize(width, height);
        applyCamera();
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const pointers = new Map<number, Point>();
      let lastSingle: Point | null = null;
      let lastPinch: { midpoint: Point; distance: number } | null = null;
      const local = (event: PointerEvent): Point => {
        const bounds = host.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      };
      const pinch = () => {
        const [first, second] = [...pointers.values()];
        return {
          midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
          distance: Math.hypot(first.x - second.x, first.y - second.y),
        };
      };
      const onPointerDown = (event: PointerEvent) => {
        host.setPointerCapture(event.pointerId);
        pointers.set(event.pointerId, local(event));
        lastSingle = pointers.size === 1 ? local(event) : null;
        lastPinch = pointers.size === 2 ? pinch() : null;
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!pointers.has(event.pointerId)) return;
        const point = local(event);
        pointers.set(event.pointerId, point);
        if (pointers.size === 1 && lastSingle) {
          camera = { ...camera, panX: camera.panX + point.x - lastSingle.x, panY: camera.panY + point.y - lastSingle.y };
          lastSingle = point;
        } else if (pointers.size === 2) {
          const next = pinch();
          if (lastPinch && lastPinch.distance > 0) {
            camera = zoomAround(camera, next.distance / lastPinch.distance, lastPinch.midpoint, next.midpoint, baseScale(), viewport(), sceneSize);
          }
          lastPinch = next;
        }
        applyCamera();
      };
      const onPointerEnd = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
        lastSingle = pointers.size === 1 ? [...pointers.values()][0] : null;
        lastPinch = pointers.size === 2 ? pinch() : null;
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const bounds = host.getBoundingClientRect();
        const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        camera = zoomAround(camera, Math.exp(-event.deltaY * 0.001), point, point, baseScale(), viewport(), sceneSize);
        applyCamera();
      };
      host.addEventListener('pointerdown', onPointerDown);
      host.addEventListener('pointermove', onPointerMove);
      host.addEventListener('pointerup', onPointerEnd);
      host.addEventListener('pointercancel', onPointerEnd);
      host.addEventListener('wheel', onWheel, { passive: false });
      removeGestures = () => {
        host.removeEventListener('pointerdown', onPointerDown);
        host.removeEventListener('pointermove', onPointerMove);
        host.removeEventListener('pointerup', onPointerEnd);
        host.removeEventListener('pointercancel', onPointerEnd);
        host.removeEventListener('wheel', onWheel);
      };
    }
    void mount();
    return () => {
      disposed = true;
      observer?.disconnect();
      removeGestures();
      updateTimeRef.current = () => undefined;
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [pumps]);

  return <div className="station-canvas" ref={hostRef} aria-label="Изометрическая карта АЗС" role="img" />;
}
