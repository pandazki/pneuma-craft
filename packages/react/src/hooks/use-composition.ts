import type { Composition } from '@pneuma-craft/timeline';
import { usePneumaCraftStore } from '../context.js';

export function useComposition(): Composition | null {
  return usePneumaCraftStore((s) => s.composition);
}
