import React, { useCallback, useMemo, useState } from 'react';
import type { Asset, AssetType } from '@pneuma-craft/core';
import { useAssets } from '../hooks/use-assets.js';

export interface AssetLibraryState {
  readonly assets: Asset[];
  readonly selectedAssetId: string | null;
  readonly selectAsset: (id: string | null) => void;
}

export interface AssetLibraryRootProps {
  filter?: AssetType;
  onAssetSelect?: (asset: Asset | null) => void;
  children: (state: AssetLibraryState) => React.ReactNode;
}

export function AssetLibraryRoot({ filter, onAssetSelect, children }: AssetLibraryRootProps) {
  const allAssets = useAssets();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const assets = useMemo(
    () => (filter ? allAssets.filter((a) => a.type === filter) : allAssets),
    [allAssets, filter],
  );

  const selectAsset = useCallback(
    (id: string | null) => {
      setSelectedAssetId(id);
      if (onAssetSelect) {
        const asset = id ? allAssets.find((a) => a.id === id) ?? null : null;
        onAssetSelect(asset);
      }
    },
    [allAssets, onAssetSelect],
  );

  return <>{children({ assets, selectedAssetId, selectAsset })}</>;
}
