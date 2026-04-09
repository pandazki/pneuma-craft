import type { Composition } from './types.js';

export interface CompositionState {
  readonly composition: Composition | null;
}

export function createInitialCompositionState(): CompositionState {
  return { composition: null };
}
