import React from 'react';
import { vi } from 'vitest';
import type { AssetResolver } from '@pneuma-craft/video';
import type { Asset } from '@pneuma-craft/core';
import { PneumaCraftProvider } from '../src/provider.js';

export function createMockAssetResolver(): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
  };
}

export function createMockAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    type: 'video',
    uri: '/test.mp4',
    name: 'Test Video',
    metadata: { width: 1920, height: 1080, duration: 10 },
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createTestWrapper(resolver?: AssetResolver) {
  const assetResolver = resolver ?? createMockAssetResolver();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PneumaCraftProvider assetResolver={assetResolver}>
        {children}
      </PneumaCraftProvider>
    );
  };
}
