import {describe,it,expect,vi} from 'vitest';
import {GameEngine} from './GameEngine';

describe('price update persistence',()=>{
 it('prepares ordinary price saves in a worker before writing storage',()=>{
  vi.useFakeTimers();
  const data=new Map<string,string>();
  const jobs:Array<{id:number;save:unknown}>=[];
  class FakeWorker {
   onmessage:((event:MessageEvent<{id:number;data:string}>)=>void)|null=null;
   onerror:((event:ErrorEvent)=>void)|null=null;
   postMessage(job:{id:number;save:unknown}){jobs.push(job);}
   terminate(){}
  }
  vi.stubGlobal('Worker',FakeWorker);
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
  try{
   const engine=new GameEngine();
   expect(engine.setRetailPrice('ai92',engine.getState().station.fuels.ai92.retailKopeks+100)).toBe(true);
   expect(data.has('azs-simulator-save')).toBe(false);
   vi.advanceTimersByTime(1000);
   expect(jobs).toHaveLength(1);
   expect(data.has('azs-simulator-save')).toBe(false);
   (engine as unknown as {saveWorker:FakeWorker}).saveWorker.onmessage?.({data:{id:jobs[0].id,data:JSON.stringify(jobs[0].save)}} as MessageEvent<{id:number;data:string}>);
   expect(data.has('azs-simulator-save')).toBe(true);
   expect(new GameEngine().getState().station.fuels.ai92.retailKopeks).toBe(engine.getState().station.fuels.ai92.retailKopeks);
  }finally{vi.useRealTimers();vi.unstubAllGlobals()}
 });
 it('publishes each rapid change and coalesces synchronous writes',()=>{
  vi.useFakeTimers();
  const data=new Map<string,string>();let writes=0;
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{if(key==='azs-simulator-save')writes++;data.set(key,value)},removeItem:(key:string)=>data.delete(key)});
  try{
   const engine=new GameEngine();const initial=engine.getState().commerce!.prices.water;
   expect(engine.setGoodsPrice('water',initial+100)).toBe(true);
   expect(engine.setGoodsPrice('water',initial+200)).toBe(true);
   expect(engine.getState().commerce!.prices.water).toBe(initial+200);
   expect(writes).toBe(0);
   vi.advanceTimersByTime(10000);
   expect(writes).toBe(1);
   expect(new GameEngine().getState().commerce!.prices.water).toBe(initial+200);
  }finally{vi.useRealTimers();vi.unstubAllGlobals()}
 });
 it('flushes a pending price when the engine stops',()=>{
  vi.useFakeTimers();
  const data=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
  try{
   const engine=new GameEngine();
   const price=engine.getState().commerce!.prices.water+100;
   engine.setGoodsPrice('water',price);
   engine.stop();
   expect(new GameEngine().getState().commerce!.prices.water).toBe(price);
  }finally{vi.useRealTimers();vi.unstubAllGlobals()}
 });
});
