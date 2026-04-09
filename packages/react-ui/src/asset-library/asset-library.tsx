import React, { useState, createContext, useContext } from 'react';
import { AssetLibraryRoot } from '@pneuma-craft/react';
import type { AssetLibraryState } from '@pneuma-craft/react';
import type { AssetType } from '@pneuma-craft/core';
import { AssetLibraryFilter } from './asset-library-filter.js';
import { AssetLibraryGrid } from './asset-library-grid.js';
import './asset-library.css';

interface AssetLibraryContextValue extends AssetLibraryState {
  filterType: AssetType | null;
  setFilterType: (t: AssetType | null) => void;
}

const AssetLibraryContext = createContext<AssetLibraryContextValue | null>(null);

function useAssetLibraryContext() {
  const ctx = useContext(AssetLibraryContext);
  if (!ctx) throw new Error('AssetLibrary sub-component must be used within <AssetLibrary>');
  return ctx;
}

export interface AssetLibraryProps {
  className?: string;
  style?: React.CSSProperties;
  onAssetSelect?: (assetId: string) => void;
  children?: React.ReactNode;
}

function CompoundFilter() {
  const { filterType, setFilterType } = useAssetLibraryContext();
  return <AssetLibraryFilter activeType={filterType} onTypeChange={setFilterType} />;
}

function CompoundGrid() {
  const { assets, selectedAssetId, selectAsset } = useAssetLibraryContext();
  return <AssetLibraryGrid assets={assets} selectedAssetId={selectedAssetId} onSelect={selectAsset} />;
}

function AssetLibraryBase({ className, style, onAssetSelect, children }: AssetLibraryProps) {
  const [filterType, setFilterType] = useState<AssetType | null>(null);

  return (
    <AssetLibraryRoot
      filter={filterType ?? undefined}
      onAssetSelect={onAssetSelect ? (asset) => { if (asset) onAssetSelect(asset.id); } : undefined}
    >
      {(state) => (
        <AssetLibraryContext.Provider value={{ ...state, filterType, setFilterType }}>
          <div className={`pc-asset-library ${className ?? ''}`} style={style}>
            {children ?? (
              <>
                <CompoundFilter />
                <CompoundGrid />
              </>
            )}
          </div>
        </AssetLibraryContext.Provider>
      )}
    </AssetLibraryRoot>
  );
}

export const AssetLibrary = Object.assign(AssetLibraryBase, {
  Filter: CompoundFilter,
  Grid: CompoundGrid,
});
