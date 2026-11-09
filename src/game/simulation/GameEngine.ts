import type { TimeSpeed } from '../domain/types';
import { INITIAL_GAME_SECONDS } from './time';

const FIXED_STEP_MS = 50;
const GAME_SECONDS_PER_REAL_SECOND = 60;

export class GameEngine {
  private gameSeconds = INITIAL_GAME_SECONDS;
  private speed: TimeSpeed = 1;
  private paused = false;
  private accumulator = 0;
  private lastRealTime = 0;
  private lastPublished = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private listeners = new Set<(gameSeconds: number) => void>();

  getSnapshot(): number { return this.gameSeconds; }

  subscribe(listener: (gameSeconds: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setControls(paused: boolean, speed: TimeSpeed): void {
    this.paused = paused;
    this.speed = speed;
  }

  start(): void {
    if (this.timer) return;
    this.lastRealTime = performance.now();
    this.lastPublished = this.lastRealTime;
    this.timer = setInterval(() => this.pulse(performance.now()), 25);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  // The timer only supplies elapsed real time. Future simulation systems update here in fixed steps.
  pulse(now: number): void {
    const elapsed = Math.max(0, now - this.lastRealTime);
    this.lastRealTime = now;
    if (!this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= FIXED_STEP_MS && steps < 200) {
        this.gameSeconds += (FIXED_STEP_MS / 1000) * GAME_SECONDS_PER_REAL_SECOND * this.speed;
        this.accumulator -= FIXED_STEP_MS;
        steps++;
      }
    } else {
      this.accumulator = 0;
    }
    if (now - this.lastPublished >= 200) {
      this.lastPublished = now;
      for (const listener of this.listeners) listener(this.gameSeconds);
    }
  }
}
