import type { Selection } from '@pneuma-craft/core';
import { usePneumaCraftStore } from '../context.js';

export function useSelection(): Selection {
  return usePneumaCraftStore((s) => s.coreState.selection);
}
