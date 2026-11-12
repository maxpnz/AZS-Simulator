import type { FuelId, GameState, TimeSpeed } from '../domain/types';
import { StationSimulation } from './StationSimulation';

const FIXED_STEP_MS=50;
const GAME_SECONDS_PER_REAL_SECOND=60;
export class GameEngine {
  private simulation=new StationSimulation();
  private lastSaved=0;
  private lastDiagnostic=0;
  private saveHealthy=true;
  private loadError=false;
  constructor(){
    if(typeof localStorage!=='undefined')try{const data=localStorage.getItem('azs-simulator-save');if(data)this.simulation=StationSimulation.importSave(JSON.parse(data));}catch{this.saveHealthy=false;this.loadError=true;}
    if(typeof localStorage!=='undefined')try{const speed=Number(localStorage.getItem('azs-simulator-speed'));if([1,2,5,10].includes(speed))this.speed=speed as TimeSpeed;}catch{/* storage unavailable */}
  }
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
  getSpeed():TimeSpeed {return this.speed;}
  getLoadError():boolean {return this.loadError;}
  subscribe(listener:(gameSeconds:number)=>void):()=>void {
    this.listeners.add(listener);return ()=>this.listeners.delete(listener);
  }
  subscribeState(listener:(state:GameState)=>void,interval=200):()=>void {
    this.stateListeners.set(listener,{interval,last:-Infinity});
    return ()=>this.stateListeners.delete(listener);
  }
  private action(result:boolean):boolean {if(result){this.save();this.publishState();}return result;}
  setRetailPrice(fuel:FuelId,kopeks:number):boolean {return this.action(this.simulation.setRetailPrice(fuel,kopeks));}
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {return this.action(this.simulation.setPumpFuels(pumpId,fuels));}
  buildPump(slot:number):boolean {return this.action(this.simulation.buildPump(slot));}
  upgradePump(id:string):boolean {return this.action(this.simulation.upgradePump(id));}
  setPumpEnabled(id:string,enabled:boolean):boolean {return this.action(this.simulation.setPumpEnabled(id,enabled));}
  buildTank(fuel:FuelId):boolean {return this.action(this.simulation.buildTank(fuel));}
  upgradeTank(id:string):boolean {return this.action(this.simulation.upgradeTank(id));}
  orderDelivery(fuel:FuelId,litres:number):boolean {return this.action(this.simulation.orderDelivery(fuel,litres));}
  getOffers(fuel:FuelId) {return this.simulation.getOffers(fuel);}
  orderTrip(supplierId:string,sections:readonly {fuel:FuelId;litres:number}[]):boolean {return this.action(this.simulation.orderTrip(supplierId,sections));}
  exportSave():string {return JSON.stringify(this.simulation.exportSave());}
  importSave(json:string):void {this.simulation=StationSimulation.importSave(JSON.parse(json));this.publishState();}
  save():void {if(this.saveHealthy&&typeof localStorage!=='undefined')try{
    const old=localStorage.getItem('azs-simulator-save');
    if(old&&!localStorage.getItem('azs-simulator-save-v04-backup')){
      const version=(JSON.parse(old) as {version?:string}).version;
      if(version==='0.4.0')localStorage.setItem('azs-simulator-save-v04-backup',old);
    }
    localStorage.setItem('azs-simulator-save',this.exportSave());
  }catch{this.saveHealthy=false;}}
  loadSaved():boolean {if(typeof localStorage==='undefined')return false;const data=localStorage.getItem('azs-simulator-save');if(!data)return false;try{this.importSave(data);return true;}catch{return false;}}
  reset():void {
    this.simulation=new StationSimulation();this.accumulator=0;this.paused=false;this.speed=1;this.saveHealthy=true;
    this.lastRealTime=performance.now();
    this.save();this.publishState();
    for(const listener of this.listeners)listener(this.simulation.gameSeconds);
  }
  private publishState():void {const state=this.simulation.snapshot();for(const listener of this.stateListeners.keys())listener(state);}
  setControls(paused:boolean,speed:TimeSpeed):void {
    if(paused!==this.paused){this.accumulator=0;this.lastRealTime=performance.now();}
    this.paused=paused;this.speed=speed;
    if(typeof localStorage!=='undefined')try{localStorage.setItem('azs-simulator-speed',String(speed));}catch{/* storage unavailable */}
  }
  resetClock(now=performance.now()):void {this.lastRealTime=now;this.accumulator=0;}
  start():void {
    if(this.timer) return;
    this.lastRealTime=performance.now();this.lastPublished=this.lastRealTime;
    this.timer=setInterval(()=>this.pulse(performance.now()),25);
  }
  stop():void {if(this.timer) clearInterval(this.timer);this.timer=undefined;}
  pulse(now:number):void {
    const elapsed=Math.min(100,Math.max(0,now-this.lastRealTime));this.lastRealTime=now;
    if(!this.paused) {
      this.accumulator+=elapsed;
      let steps=0;
      while(this.accumulator>=FIXED_STEP_MS&&steps<2) {
        this.simulation.step(FIXED_STEP_MS/1000*GAME_SECONDS_PER_REAL_SECOND*this.speed);
        this.accumulator-=FIXED_STEP_MS;steps++;
      }
      if(steps===2)this.accumulator=0;
    } else this.accumulator=0;
    if(now-this.lastPublished>=200) {
      this.lastPublished=now;
      for(const listener of this.listeners) listener(this.simulation.gameSeconds);
    }
    if(now-this.lastSaved>=5000){this.lastSaved=now;this.save();}
    if(import.meta.env.DEV&&now-this.lastDiagnostic>=5000){this.lastDiagnostic=now;for(const issue of this.simulation.trafficDiagnostics())console.debug('[AZS traffic]',issue);}
    for(const [listener,meta] of this.stateListeners) if(now-meta.last>=meta.interval) {
      meta.last=now;listener(this.simulation.snapshot());
    }
  }
}
