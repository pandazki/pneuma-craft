import type { PneumaCraftCoreState, Asset, AssetType } from './types.js';

export function getAssetById(state: PneumaCraftCoreState, assetId: string): Asset | undefined {
  return state.registry.get(assetId);
}

export function getAssetsByType(state: PneumaCraftCoreState, type: AssetType): Asset[] {
  return Array.from(state.registry.values()).filter(a => a.type === type);
}

export function searchAssets(state: PneumaCraftCoreState, query: string): Asset[] {
  const lower = query.toLowerCase();
  return Array.from(state.registry.values()).filter(asset => {
    if (asset.name.toLowerCase().includes(lower)) return true;
    if (asset.tags?.some(tag => tag.toLowerCase().includes(lower))) return true;
    return false;
  });
}
