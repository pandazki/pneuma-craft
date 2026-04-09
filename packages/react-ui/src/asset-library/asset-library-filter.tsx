import React from 'react';
import type { AssetType } from '@pneuma-craft/core';

const FILTER_TABS: Array<{ label: string; type: AssetType | null }> = [
  { label: 'All', type: null },
  { label: 'Video', type: 'video' },
  { label: 'Image', type: 'image' },
  { label: 'Audio', type: 'audio' },
  { label: 'Text', type: 'text' },
];

export interface AssetLibraryFilterProps {
  activeType: AssetType | null;
  onTypeChange: (type: AssetType | null) => void;
}

export function AssetLibraryFilter({ activeType, onTypeChange }: AssetLibraryFilterProps) {
  return (
    <div className="pc-asset-filter">
      {FILTER_TABS.map((tab) => (
        <button
          key={tab.label}
          className={`pc-asset-filter-tab ${activeType === tab.type ? 'pc-asset-filter-tab--active' : ''}`}
          onClick={() => onTypeChange(tab.type)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
