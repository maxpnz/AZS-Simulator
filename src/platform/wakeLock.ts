/** Page lifecycle only. Game time and pause state do not affect the display lock. */
export function installWakeLock():()=>void {
  type Sentinel = {released:boolean;release:()=>Promise<void>;addEventListener:(type:'release',listener:()=>void)=>void};
  const api=(navigator as Navigator & {wakeLock?:{request:(type:'screen')=>Promise<Sentinel>}}).wakeLock;
  if(!api)return ()=>{};
  let sentinel:Sentinel|undefined;
  let pending=false;
  let disposed=false;
  let generation=0;
  const acquire=async()=>{
    if(disposed||document.visibilityState!=='visible'||sentinel||pending)return;
    const current=++generation;pending=true;
    try{
      const next=await api.request('screen');
      if(disposed||document.visibilityState!=='visible'||current!==generation){await next.release();return;}
      sentinel=next;
      next.addEventListener('release',()=>{if(sentinel===next)sentinel=undefined;});
    }catch{/* Wake Lock may require user activation or be denied by the OS. */}
    finally{pending=false;if(current!==generation&&!disposed&&document.visibilityState==='visible')queueMicrotask(()=>void acquire());}
  };
  const release=()=>{generation++;const held=sentinel;sentinel=undefined;if(held&&!held.released)void held.release().catch(()=>{});};
  const visibility=()=>{if(document.visibilityState==='visible')void acquire();else release();};
  const gesture=()=>void acquire();
  document.addEventListener('visibilitychange',visibility);
  document.addEventListener('pointerdown',gesture,{passive:true});
  document.addEventListener('keydown',gesture);
  window.addEventListener('pageshow',visibility);
  window.addEventListener('pagehide',release);
  void acquire();
  return ()=>{disposed=true;release();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);window.removeEventListener('pageshow',visibility);window.removeEventListener('pagehide',release);};
}
