import { describe, it, expect } from 'vitest';
import { getAssetById, getAssetsByType, searchAssets } from '../src/asset-queries.js';
import { createInitialState } from '../src/state.js';
import type { Asset, PneumaCraftCoreState } from '../src/types.js';

function stateWithAssets(...assets: Asset[]): PneumaCraftCoreState {
  const state = createInitialState();
  const registry = new Map(assets.map(a => [a.id, a]));
  return { ...state, registry };
}

const video1: Asset = { id: 'v1', type: 'video', uri: '/clip1.mp4', name: 'Hero Shot', metadata: { width: 1920 }, createdAt: 1000, tags: ['hero', 'intro'] };
const video2: Asset = { id: 'v2', type: 'video', uri: '/clip2.mp4', name: 'B-Roll', metadata: {}, createdAt: 2000, tags: ['broll'] };
const image1: Asset = { id: 'i1', type: 'image', uri: '/bg.png', name: 'Background Image', metadata: { width: 3840 }, createdAt: 3000 };

describe('getAssetById', () => {
  it('returns asset when found', () => {
    const state = stateWithAssets(video1);
    expect(getAssetById(state, 'v1')).toEqual(video1);
  });
  it('returns undefined when not found', () => {
    const state = stateWithAssets(video1);
    expect(getAssetById(state, 'nope')).toBeUndefined();
  });
});

describe('getAssetsByType', () => {
  it('returns all assets of given type', () => {
    const state = stateWithAssets(video1, video2, image1);
    const videos = getAssetsByType(state, 'video');
    expect(videos).toHaveLength(2);
    expect(videos.map(a => a.id).sort()).toEqual(['v1', 'v2']);
  });
  it('returns empty array when no matches', () => {
    const state = stateWithAssets(video1);
    expect(getAssetsByType(state, 'audio')).toEqual([]);
  });
});

describe('searchAssets', () => {
  it('matches by name (case-insensitive)', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'hero');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });
  it('matches by tag', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'broll');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v2');
  });
  it('matches partial name', () => {
    const state = stateWithAssets(video1, video2, image1);
    const results = searchAssets(state, 'back');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('i1');
  });
  it('returns empty for no match', () => {
    const state = stateWithAssets(video1);
    expect(searchAssets(state, 'zzz')).toEqual([]);
  });
});
