import { afterEach, describe, expect, it, vi } from 'vitest';
import { installWakeLock } from './wakeLock';
afterEach(()=>vi.unstubAllGlobals());
describe('screen wake lock lifecycle',()=>{
  it('degrades when unavailable',()=>{
    vi.stubGlobal('navigator',{});
    expect(installWakeLock()).toBeTypeOf('function');
  });
  it('releases when hidden and reacquires when visible',async()=>{
    const document=new EventTarget() as Document;
    let visibilityState='visible';
    Object.defineProperty(document,'visibilityState',{get:()=>visibilityState});
    const window=new EventTarget() as Window;
    const release=vi.fn(async()=>{});
    const request=vi.fn(async()=>({released:false,release,addEventListener:()=>{}}));
    vi.stubGlobal('navigator',{wakeLock:{request}});vi.stubGlobal('document',document);vi.stubGlobal('window',window);
    const dispose=installWakeLock();await Promise.resolve();await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
    visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    dispose();
  });
});
