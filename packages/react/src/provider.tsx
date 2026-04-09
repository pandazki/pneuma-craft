import React, { useRef } from 'react';
import type { AssetResolver, CompositorType } from '@pneuma-craft/video';
import { PneumaCraftContext } from './context.js';
import { createPneumaCraftStore, type PneumaCraftStoreApi } from './store.js';

export interface PneumaCraftProviderProps {
  children: React.ReactNode;
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
  return (
    <PneumaCraftContext.Provider value={storeRef.current}>
      {children}
    </PneumaCraftContext.Provider>
  );
}
