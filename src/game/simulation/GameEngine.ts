import type { FuelId, GameState, TimeSpeed } from '../domain/types';
import { StationSimulation } from './StationSimulation';

const FIXED_STEP_MS=50;
const GAME_SECONDS_PER_REAL_SECOND=60;
export class GameEngine {
  private simulation=new StationSimulation();
  private speed:TimeSpeed=1;
  private paused=false;
  private accumulator=0;
  private lastRealTime=0;
  private lastPublished=0;
  private timer:ReturnType<typeof setInterval>|undefined;
  private listeners=new Set<(gameSeconds:number)=>void>();
  private stateListeners=new Map<(state:GameState)=>void,{interval:number;last:number}>();
  getSnapshot():number {return this.simulation.gameSeconds;}
  getState():GameState {return this.simulation.snapshot();}
  subscribe(listener:(gameSeconds:number)=>void):()=>void {
    this.listeners.add(listener);return ()=>this.listeners.delete(listener);
  }
  subscribeState(listener:(state:GameState)=>void,interval=200):()=>void {
    this.stateListeners.set(listener,{interval,last:-Infinity});
    return ()=>this.stateListeners.delete(listener);
  }
  setRetailPrice(fuel:FuelId,kopeks:number):boolean {return this.simulation.setRetailPrice(fuel,kopeks);}
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {return this.simulation.setPumpFuels(pumpId,fuels);}
  setControls(paused:boolean,speed:TimeSpeed):void {this.paused=paused;this.speed=speed;}
  start():void {
    if(this.timer) return;
    this.lastRealTime=performance.now();this.lastPublished=this.lastRealTime;
    this.timer=setInterval(()=>this.pulse(performance.now()),25);
  }
  stop():void {if(this.timer) clearInterval(this.timer);this.timer=undefined;}
  pulse(now:number):void {
    const elapsed=Math.max(0,now-this.lastRealTime);this.lastRealTime=now;
    if(!this.paused) {
      this.accumulator+=elapsed;
      let steps=0;
      while(this.accumulator>=FIXED_STEP_MS&&steps<200) {
        this.simulation.step(FIXED_STEP_MS/1000*GAME_SECONDS_PER_REAL_SECOND*this.speed);
        this.accumulator-=FIXED_STEP_MS;steps++;
      }
    } else this.accumulator=0;
    if(now-this.lastPublished>=200) {
      this.lastPublished=now;
      for(const listener of this.listeners) listener(this.simulation.gameSeconds);
    }
    for(const [listener,meta] of this.stateListeners) if(now-meta.last>=meta.interval) {
      meta.last=now;listener(this.simulation.snapshot());
    }
  }
}
