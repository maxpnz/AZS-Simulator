import { describe, expect, it } from 'vitest';
import { InteractionGate } from './interactionGate';

function pointer(type:string,id:number):Event {
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperty(event,'pointerId',{value:id});return event;
}
function click(detail:number):Event {
  const event=new Event('click',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'detail',{value:detail});return event;
}
describe('screen interaction gate',()=>{
  it('blocks a click from a press on the previous screen and accepts a fresh press',()=>{
    const target=new EventTarget();const gate=new InteractionGate();
    const detach=gate.attach(target as Document);
    target.dispatchEvent(pointer('pointerdown',1));gate.transition();target.dispatchEvent(pointer('pointerup',1));
    const stale=click(1);target.dispatchEvent(stale);expect(stale.defaultPrevented).toBe(true);
    target.dispatchEvent(pointer('pointerdown',2));target.dispatchEvent(pointer('pointerup',2));
    const fresh=click(1);target.dispatchEvent(fresh);expect(fresh.defaultPrevented).toBe(false);
    gate.transition();const keyboard=click(0);target.dispatchEvent(keyboard);expect(keyboard.defaultPrevented).toBe(false);
    detach();
  });
});
