import React from 'react';
import type { Asset } from '@pneuma-craft/core';
import { AssetLibraryItem } from './asset-library-item.js';

export interface AssetLibraryGridProps {
  assets: readonly Asset[];
  selectedAssetId: string | null;
  onSelect: (assetId: string) => void;
}

export function AssetLibraryGrid({ assets, selectedAssetId, onSelect }: AssetLibraryGridProps) {
  return (
    <div className="pc-asset-grid">
      {assets.map((asset) => (
        <AssetLibraryItem
          key={asset.id}
          asset={asset}
          selected={asset.id === selectedAssetId}
          onSelect={onSelect}
        />
      ))}
      {assets.length === 0 && (
        <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--pc-fg-dim)', padding: 'var(--pc-space-4)', fontSize: 'var(--pc-font-size-sm)' }}>
          No assets
        </div>
      )}
    </div>
  );
}
