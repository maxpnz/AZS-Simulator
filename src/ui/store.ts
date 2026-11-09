import { create } from 'zustand';
import type { TimeSpeed } from '../game/domain/types';

interface UiState {
  paused: boolean;
  speed: TimeSpeed;
  togglePause: () => void;
  setSpeed: (speed: TimeSpeed) => void;
}

export const useUiStore = create<UiState>((set) => ({
  paused: false,
  speed: 1,
  togglePause: () => set((state) => ({ paused: !state.paused })),
  setSpeed: (speed) => set({ speed, paused: false }),
}));
