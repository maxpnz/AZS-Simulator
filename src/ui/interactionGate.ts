/** A pointer may click only the screen on which its press began. */
export class InteractionGate {
  private generation=0;
  private pointerGeneration=0;
  private activePointers=new Set<number>();
  private onDown=(event:PointerEvent)=>{this.pointerGeneration=this.generation;this.activePointers.add(event.pointerId);};
  private onEnd=(event:PointerEvent)=>{this.activePointers.delete(event.pointerId);};
  private onClick=(event:MouseEvent)=>{
    if(event.detail===0)return; // Keyboard activation remains available.
    if(this.pointerGeneration<this.generation){event.preventDefault();event.stopImmediatePropagation();}
  };
  attach(doc:Document):()=>void {
    doc.addEventListener('pointerdown',this.onDown,true);
    doc.addEventListener('pointerup',this.onEnd,true);
    doc.addEventListener('pointercancel',this.onEnd,true);
    doc.addEventListener('click',this.onClick,true);
    return ()=>{doc.removeEventListener('pointerdown',this.onDown,true);doc.removeEventListener('pointerup',this.onEnd,true);
      doc.removeEventListener('pointercancel',this.onEnd,true);doc.removeEventListener('click',this.onClick,true);};
  }
  transition():void {this.generation++;}
  get hasActivePointer():boolean{return this.activePointers.size>0;}
}
