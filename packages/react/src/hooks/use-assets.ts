import { useMemo } from 'react';
import type { Asset } from '@pneuma-craft/core';
import { usePneumaCraftStore } from '../context.js';

export function useAssets(): Asset[] {
  const registry = usePneumaCraftStore((s) => s.coreState.registry);
  return useMemo(() => Array.from(registry.values()), [registry]);
}

export function useAsset(id: string): Asset | undefined {
  return usePneumaCraftStore((s) => s.coreState.registry.get(id));
}
