import React, { useEffect, useRef } from 'react';
import type { AssetResolver, CompositorType, SubtitleRenderer } from '@pneuma-craft/video';
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
  /**
   * Compositor backend type. Immutable after mount.
   * To change, use a `key` prop on the Provider to force remount.
   * @default 'auto'
   */
  compositorType?: CompositorType;
  /**
   * Rasterizer for subtitle-track clips. When provided, the same function is
   * used by both the playback engine (preview) and the export engine, so the
   * exported video is pixel-identical to what the user saw. Immutable after
   * mount — use a `key` prop to swap renderers.
   */
  subtitleRenderer?: SubtitleRenderer;
}

export function PneumaCraftProvider({
  children,
  assetResolver,
  compositorType = 'auto',
  subtitleRenderer,
}: PneumaCraftProviderProps) {
  // The store holds expensive mutable state (audio context, decoder cache, timeline events).
  // We must preserve it across React 19 StrictMode's intentional mount → cleanup → remount
  // cycle — otherwise any data the consumer wrote (seed, load, dispatch) between mount and
  // cleanup is lost. We achieve this by deferring destroy() to the next macrotask; if a
  // remount happens before it fires, we cancel it.
  const storeRef = useRef<PneumaCraftStoreApi | null>(null);
  const pendingDestroyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createPneumaCraftStore(assetResolver, compositorType, { subtitleRenderer });
  }

  useEffect(() => {
    // Cancel a pending destroy from a previous StrictMode cleanup.
    if (pendingDestroyRef.current !== null) {
      clearTimeout(pendingDestroyRef.current);
      pendingDestroyRef.current = null;
    }
    return () => {
      pendingDestroyRef.current = setTimeout(() => {
        storeRef.current?.getState().destroy();
        storeRef.current = null;
        pendingDestroyRef.current = null;
      }, 0);
    };
  }, []);

  return (
    <PneumaCraftContext.Provider value={storeRef.current}>
      {children}
    </PneumaCraftContext.Provider>
  );
}
