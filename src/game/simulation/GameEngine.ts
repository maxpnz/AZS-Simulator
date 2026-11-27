import type { Venue, Sku, Product, Supplier } from '../domain/commerce';
import type { FuelId, GameState, TimeSpeed } from '../domain/types';
import { StationSimulation } from './StationSimulation';
import LZString from 'lz-string';

const FIXED_STEP_MS=50;
const GAME_SECONDS_PER_REAL_SECOND=60;
const COMPRESSED_PREFIX='AZS-LZ1:';
export function encodeStoredSave(json:string):string {return json.length<200_000?json:COMPRESSED_PREFIX+LZString.compressToUTF16(json);}
export function decodeStoredSave(data:string):string {if(!data.startsWith(COMPRESSED_PREFIX))return data;const raw=LZString.decompressFromUTF16(data.slice(COMPRESSED_PREFIX.length));if(!raw?.trimStart().startsWith('{'))throw new Error('Damaged compressed save');return raw;}
export interface SlotMetadata { name: string; gameSeconds: number; savedAt?: number }

export class GameEngine {
  private simulation=new StationSimulation();
  private lastSaved=0;
  private lastDiagnostic=0;
  private saveHealthy=true;
  private loadError=false;
  constructor(){
    if(typeof localStorage!=='undefined'){let found=false;for(const key of ['azs-simulator-save','azs-simulator-save-previous']){try{const data=localStorage.getItem(key);if(data){this.simulation=StationSimulation.importSave(JSON.parse(decodeStoredSave(data)));found=true;break;}}catch{this.loadError=true;}}if(found)this.loadError=false;else if(this.loadError)this.saveHealthy=false;}
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
  setGoodsPrice(product:Product,price:number):boolean {return this.action(this.simulation.setGoodsPrice(product,price));}
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
  private action(result:boolean):boolean {if(result){this.save();this.publishState();}return result;}
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
  importSave(json:string):void {this.simulation=StationSimulation.importSave(JSON.parse(decodeStoredSave(json)));this.saveHealthy=true;this.loadError=false;this.publishState();}
  save():void {if(this.saveHealthy&&typeof localStorage!=='undefined')try{
    const old=localStorage.getItem('azs-simulator-save');
    if(old)try{
      const version=(JSON.parse(decodeStoredSave(old)) as {version?:string}).version;
      const backup=version==='0.4.0'?'azs-simulator-save-v04-backup':version==='0.5.0'?'azs-simulator-save-v05-backup':version==='0.5.1'?'azs-simulator-save-v051-backup':version==='0.5.2'?'azs-simulator-save-v052-backup':version==='0.6.0'?'azs-simulator-save-v06-backup':version==='0.7.0'?'azs-simulator-save-v07-backup':version==='0.7.3'?'azs-simulator-save-v073-backup':version==='0.7.4'?'azs-simulator-save-v074-backup':undefined;
      if(backup&&!localStorage.getItem(backup))localStorage.setItem(backup,old);
    }catch{/* damaged previous save */}
    const nextRaw=this.exportSave();
    // Validate before touching either the current save or its backup.
    StationSimulation.importSave(JSON.parse(nextRaw));
    const next=encodeStoredSave(nextRaw);
    localStorage.setItem('azs-simulator-save-pending',next);
    if(old){try{StationSimulation.importSave(JSON.parse(decodeStoredSave(old)));localStorage.setItem('azs-simulator-save-previous',old);}catch{/* corrupted old record */}}
    localStorage.setItem('azs-simulator-save',next);
    localStorage.removeItem('azs-simulator-save-pending');
  }catch{/* A transient storage error must not disable later autosaves. */}}
  loadSaved():boolean {if(typeof localStorage==='undefined')return false;const data=localStorage.getItem('azs-simulator-save');if(!data)return false;try{this.importSave(data);return true;}catch{return false;}}
  reset():void {
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
    if(now-this.lastSaved>=60000){this.lastSaved=now;this.save();}
    if(import.meta.env.DEV&&now-this.lastDiagnostic>=5000){this.lastDiagnostic=now;for(const issue of this.simulation.trafficDiagnostics())console.debug('[AZS traffic]',issue);}
    for(const [listener,meta] of this.stateListeners) if(now-meta.last>=meta.interval) {
      meta.last=now;listener(this.simulation.snapshot());
    }
  }
}
