import {beforeEach,describe,expect,it} from 'vitest';
import {useUiStore} from './store';

describe('single speed control',()=>{
  beforeEach(()=>useUiStore.getState().resetControls());
  it('cycles through every existing mode including 10× and wraps to 1×',()=>{
    const sequence=[2,4,5,10,1];
    for(const expected of sequence){
      useUiStore.getState().cycleSpeed();
      expect(useUiStore.getState().speed).toBe(expected);
    }
  });
});
