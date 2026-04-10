import React from 'react';
import type { Asset } from '@pneuma-craft/core';

export interface AssetLibraryItemProps {
  asset: Asset;
  selected: boolean;
  onSelect: (assetId: string) => void;
}

export function AssetLibraryItem({ asset, selected, onSelect }: AssetLibraryItemProps) {
  return (
    <div
      className={`pc-asset-item ${selected ? 'pc-asset-item--selected' : ''}`}
      onClick={() => onSelect(asset.id)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-pneuma-asset-id', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="pc-asset-item-thumbnail">
        {asset.type === 'image' && asset.uri ? (
          <img src={asset.uri} alt={asset.name} className="pc-asset-item-img" />
        ) : asset.type === 'video' && asset.uri ? (
          <video src={asset.uri} className="pc-asset-item-img" muted preload="metadata" />
        ) : (
          asset.type.toUpperCase()
        )}
      </div>
      <span className="pc-asset-item-name" title={asset.name}>{asset.name}</span>
      <span className="pc-asset-item-badge">{asset.type}</span>
    </div>
  );
}
