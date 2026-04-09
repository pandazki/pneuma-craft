import React, { useRef, useEffect } from 'react';
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
  const resolverRef = useRef(assetResolver);
  const compositorRef = useRef(compositorType);

  // Recreate store if resolver or compositor type changes
  if (
    !storeRef.current ||
    resolverRef.current !== assetResolver ||
    compositorRef.current !== compositorType
  ) {
    storeRef.current = createPneumaCraftStore(assetResolver, compositorType);
    resolverRef.current = assetResolver;
    compositorRef.current = compositorType;
  }

  return (
    <PneumaCraftContext.Provider value={storeRef.current}>
      {children}
    </PneumaCraftContext.Provider>
  );
}
