import {describe,it,expect,vi} from 'vitest';
import {GameEngine} from './GameEngine';

describe('price update persistence',()=>{
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
