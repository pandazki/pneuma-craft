import { useMemo } from 'react';
import type { Asset } from '@pneuma-craft/core';
import { getLineage, getVariants } from '@pneuma-craft/core';
import { usePneumaCraftStore } from '../context.js';

export function useLineage(assetId: string): Asset[] {
  const coreState = usePneumaCraftStore((s) => s.coreState);
  return useMemo(() => getLineage(coreState, assetId), [coreState, assetId]);
}

export function useVariants(assetId: string): Asset[] {
  const coreState = usePneumaCraftStore((s) => s.coreState);
  return useMemo(() => getVariants(coreState, assetId), [coreState, assetId]);
}
