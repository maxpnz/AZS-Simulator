import type { Venue, Sku, Product, Supplier } from '../domain/commerce';
import type { FuelId, GameState, TimeSpeed } from '../domain/types';
import { StationSimulation } from './StationSimulation';
import { decodeStoredSave, encodeStoredSave } from './saveCodec';
import { version } from '../../../package.json';
export { decodeStoredSave, encodeStoredSave } from './saveCodec';

const FIXED_STEP_MS=50;
const GAME_SECONDS_PER_REAL_SECOND=60;
export interface SlotMetadata { name: string; gameSeconds: number; savedAt?: number }

export class GameEngine {
  private simulation=new StationSimulation();
  private lastSaved=0;
  private lastDiagnostic=0;
  private saveHealthy=true;
  private loadError=false;
  private saveTimer:ReturnType<typeof setTimeout>|undefined;
  private saveWorker:Worker|undefined;
  private saveGeneration=0;
  private workerBusy=false;
  private saveQueued=false;
  private currentSaveTrusted=false;
  private currentSaveVersion:string|undefined;
  constructor(){
    if(typeof localStorage!=='undefined'){let found=false;for(const key of ['azs-simulator-save','azs-simulator-save-previous']){try{const data=localStorage.getItem(key);if(data){const raw=JSON.parse(decodeStoredSave(data));this.simulation=StationSimulation.importSave(raw);this.currentSaveTrusted=key==='azs-simulator-save';this.currentSaveVersion=raw.version;found=true;break;}}catch{this.loadError=true;}}if(found)this.loadError=false;else if(this.loadError)this.saveHealthy=false;}
    if(typeof localStorage!=='undefined')try{const speed=Number(localStorage.getItem('azs-simulator-speed'));if([1,2,4,5,10].includes(speed))this.speed=speed as TimeSpeed;}catch{/* storage unavailable */}
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
  openVenue(venue:Venue):boolean {return this.action(this.simulation.openVenue(venue));}
  upgradeVenue(venue:Venue):boolean {return this.action(this.simulation.upgradeVenue(venue));}
  trainVenue(venue:Venue):boolean {return this.action(this.simulation.trainVenue(venue));}
  setGoodsPrice(product:Product,price:number):boolean {
    const changed=this.simulation.setGoodsPrice(product,price);
    if(changed){this.publishState();this.scheduleSave(10000);}
    return changed;
  }
  private scheduleSave(delay=1000):void {
    if(this.saveTimer)clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(()=>{this.saveTimer=undefined;this.saveInBackground();},delay);
  }
  private saveInBackground():void {
    if(!this.saveHealthy||typeof localStorage==='undefined')return;
    if(this.workerBusy){this.saveQueued=true;return;}
    if(typeof Worker==='undefined'){this.save();return;}
    try{
      this.saveWorker??=new Worker(new URL('./saveWorker.ts',import.meta.url),{type:'module'});
      this.saveWorker.onmessage=(event:MessageEvent<{id:number;data?:string;error?:string}>)=>{
        this.workerBusy=false;
        const {id,data,error}=event.data;
        if(id===this.saveGeneration){
          if(data)this.commitSave(data);
          else if(error)this.save();
        }
        if(this.saveQueued){this.saveQueued=false;this.saveInBackground();}
      };
      this.saveWorker.onerror=()=>{this.workerBusy=false;this.saveWorker?.terminate();this.saveWorker=undefined;this.save();};
      const id=++this.saveGeneration;
      this.workerBusy=true;
      this.saveWorker.postMessage({id,save:this.simulation.exportSave()});
    }catch{this.workerBusy=false;this.save();}
  }
  orderGoods(supplier:Supplier,request:Partial<Record<Sku,number>>):boolean {return this.action(this.simulation.orderGoods(supplier,request));}
  saveSlot(slot:number):boolean {if(![1,2,3].includes(slot))return false;try{localStorage.setItem(`azs-simulator-slot-${slot}`,encodeStoredSave(JSON.stringify({...this.simulation.exportSave(),savedAt:Date.now()})));return true;}catch{return false;}}
  loadSlot(slot:number):boolean {if(![1,2,3].includes(slot))return false;try{const data=localStorage.getItem(`azs-simulator-slot-${slot}`);if(!data)return false;this.importSave(data);this.save();return true;}catch{return false;}}
  getSlot(slot:number):SlotMetadata|null {
    try {
      const raw=localStorage.getItem(`azs-simulator-slot-${slot}`);
      if(!raw)return null;
      const {state,savedAt}=JSON.parse(decodeStoredSave(raw));
      return {name:state.station.name??'АЗС',gameSeconds:state.gameSeconds,savedAt:Number.isFinite(savedAt)&&Math.abs(savedAt)<=8.64e15?savedAt:undefined};
    }catch{return null;}
  }
  private action(result:boolean):boolean {if(result){this.publishState();this.scheduleSave();}return result;}
  setRetailPrice(fuel:FuelId,kopeks:number):boolean {return this.action(this.simulation.setRetailPrice(fuel,kopeks));}
  setStationName(value:string):boolean {return this.action(this.simulation.setStationName(value));}
  setPumpFuels(pumpId:string,fuels:readonly FuelId[]):boolean {return this.action(this.simulation.setPumpFuels(pumpId,fuels));}
  buildPump(slot:number):boolean {return this.action(this.simulation.buildPump(slot));}
  upgradePump(id:string):boolean {return this.action(this.simulation.upgradePump(id));}
  setPumpEnabled(id:string,enabled:boolean):boolean {return this.action(this.simulation.setPumpEnabled(id,enabled));}
  buildTank(fuel:FuelId):boolean {return this.action(this.simulation.buildTank(fuel));}
  upgradeTank(id:string):boolean {return this.action(this.simulation.upgradeTank(id));}
  orderDelivery(fuel:FuelId,litres:number):boolean {return this.action(this.simulation.orderDelivery(fuel,litres));}
  getOffers(fuel:FuelId) {return this.simulation.getOffers(fuel);}
  orderTrip(supplierId:string,sections:readonly {fuel:FuelId;litres:number}[]):boolean {return this.action(this.simulation.orderTrip(supplierId,sections));}
  callContractor(equipmentId:string,type:'budget'|'standard'|'urgent'):boolean {return this.action(this.simulation.callContractor(equipmentId,type));}
  cancelRepair(equipmentId:string):boolean {return this.action(this.simulation.cancelManualRepair(equipmentId));}
  sellPump(id:string):boolean {return this.action(this.simulation.sellPump(id));}
  sellTank(id:string):boolean {return this.action(this.simulation.sellTank(id));}
  exportSave():string {return JSON.stringify(this.simulation.exportSave());}
  importSave(json:string):void {this.simulation=StationSimulation.importSave(JSON.parse(decodeStoredSave(json)));this.saveGeneration++;this.saveHealthy=true;this.loadError=false;this.publishState();}
  private commitSave(next:string):void {
    try{
    const old=localStorage.getItem('azs-simulator-save');
    if(old&&this.currentSaveTrusted){
      const version=this.currentSaveVersion;
      const backup=version==='0.4.0'?'azs-simulator-save-v04-backup':version==='0.5.0'?'azs-simulator-save-v05-backup':version==='0.5.1'?'azs-simulator-save-v051-backup':version==='0.5.2'?'azs-simulator-save-v052-backup':version==='0.6.0'?'azs-simulator-save-v06-backup':version==='0.7.0'?'azs-simulator-save-v07-backup':version==='0.7.3'?'azs-simulator-save-v073-backup':version==='0.7.4'?'azs-simulator-save-v074-backup':undefined;
      if(backup&&!localStorage.getItem(backup))localStorage.setItem(backup,old);
    }
    localStorage.setItem('azs-simulator-save-pending',next);
    if(old&&this.currentSaveTrusted)localStorage.setItem('azs-simulator-save-previous',old);
    localStorage.setItem('azs-simulator-save',next);
    localStorage.removeItem('azs-simulator-save-pending');
    this.currentSaveTrusted=true;
    this.currentSaveVersion=version;
    }catch{/* A transient storage error must not disable later autosaves. */}
  }
  save():void {
    if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=undefined;}
    this.saveGeneration++;
    if(!this.saveHealthy||typeof localStorage==='undefined')return;
    try{
      const raw=this.simulation.exportSave();
      StationSimulation.importSave(raw);
      this.commitSave(encodeStoredSave(JSON.stringify(raw)));
    }catch{/* Keep the last valid save. */}
  }
  loadSaved():boolean {if(typeof localStorage==='undefined')return false;const data=localStorage.getItem('azs-simulator-save');if(!data)return false;try{this.importSave(data);return true;}catch{return false;}}
  reset():void {
    if(this.saveTimer){clearTimeout(this.saveTimer);this.saveTimer=undefined;}
    this.saveGeneration++;
    this.simulation=new StationSimulation();this.accumulator=0;this.paused=false;this.speed=1;this.saveHealthy=true;
    this.lastRealTime=performance.now();
    try{localStorage.removeItem('azs-simulator-save');localStorage.removeItem('azs-simulator-save-previous');localStorage.removeItem('azs-simulator-save-pending');}catch{/* storage unavailable */}
    this.save();this.lastSaved=performance.now();this.publishState();
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
    this.lastRealTime=performance.now();this.lastPublished=this.lastRealTime;this.lastSaved=this.lastRealTime;
    this.timer=setInterval(()=>this.pulse(performance.now()),25);
  }
  stop():void {if(this.timer) clearInterval(this.timer);this.timer=undefined;if(this.saveTimer||this.workerBusy)this.save();}
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
    if(now-this.lastSaved>=60000){this.lastSaved=now;this.saveInBackground();}
    if(import.meta.env.DEV&&now-this.lastDiagnostic>=5000){this.lastDiagnostic=now;for(const issue of this.simulation.trafficDiagnostics())console.debug('[AZS traffic]',issue);}
    let publishedState:GameState|undefined;
    for(const [listener,meta] of this.stateListeners) if(now-meta.last>=meta.interval) {
      meta.last=now;
      publishedState??=this.simulation.snapshot();
      listener(publishedState);
    }
  }
}
