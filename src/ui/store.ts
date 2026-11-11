import { create } from 'zustand';
import type { TimeSpeed } from '../game/domain/types';
const speeds: readonly TimeSpeed[] = [1, 2, 5, 10];
interface UiState { paused: boolean; backgroundPause:boolean; interfacePause:boolean; speed: TimeSpeed; togglePause: () => void; setBackgroundPause:(value:boolean)=>void; setInterfacePause:(value:boolean)=>void; cycleSpeed: () => void; resetControls: () => void }
export const useUiStore = create<UiState>((set) => ({
  paused: false, backgroundPause:false, interfacePause:false, speed: 1,
  togglePause: () => set((state) => ({ paused: !state.paused })),
  setBackgroundPause:(value)=>set({backgroundPause:value}),
  setInterfacePause:(value)=>set({interfacePause:value}),
  cycleSpeed: () => set((state) => ({ speed: speeds[(speeds.indexOf(state.speed)+1)%speeds.length] })),
  resetControls: () => set({paused:false,speed:1}),
}));
