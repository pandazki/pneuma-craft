import type { Composition, CompositionSettings, Track, Clip } from '../src/types.js';

export const defaultSettings: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
};

export function createMockClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 5,
    inPoint: 0,
    outPoint: 5,
    ...overrides,
  };
}

export function createMockTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'video',
    name: 'Video 1',
    clips: [],
    muted: false,
    volume: 1,
    locked: false,
    ...overrides,
  };
}

export function createMockComposition(overrides: Partial<Composition> = {}): Composition {
  return {
    id: 'comp-1',
    settings: defaultSettings,
    tracks: [],
    transitions: [],
    duration: 0,
    ...overrides,
  };
}
