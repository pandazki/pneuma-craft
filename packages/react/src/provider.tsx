import React, { useEffect, useRef } from 'react';
import type { AssetResolver, CompositorType } from '@pneuma-craft/video';
import { PneumaCraftContext } from './context.js';
import { createPneumaCraftStore, type PneumaCraftStoreApi } from './store.js';

export interface PneumaCraftProviderProps {
  children: React.ReactNode;
  /**
   * Resolver for loading asset URLs/blobs.
   * Must be a stable reference (e.g. via useMemo or module-level constant).
   * If you need to change the resolver, use a `key` prop on the Provider to force remount.
   */
  assetResolver: AssetResolver;
  compositorType?: CompositorType;
}

export function PneumaCraftProvider({
  children,
  assetResolver,
  compositorType = 'auto',
}: PneumaCraftProviderProps) {
  const storeRef = useRef<PneumaCraftStoreApi | null>(null);
  if (!storeRef.current) {
    storeRef.current = createPneumaCraftStore(assetResolver, compositorType);
  }

  useEffect(() => {
    return () => {
      storeRef.current?.getState().destroy();
    };
  }, []);

  return (
    <PneumaCraftContext.Provider value={storeRef.current}>
      {children}
    </PneumaCraftContext.Provider>
  );
}
