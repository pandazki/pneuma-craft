import React from 'react';
import { vi } from 'vitest';
import { PneumaCraftProvider } from '@pneuma-craft/react';
import type { AssetResolver } from '@pneuma-craft/video';

export function createMockAssetResolver(): AssetResolver {
  return {
    resolveUrl: vi.fn().mockReturnValue('http://localhost/test.mp4'),
    fetchBlob: vi.fn().mockResolvedValue(new Blob()),
  };
}

export function createTestWrapper() {
  const resolver = createMockAssetResolver();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <PneumaCraftProvider assetResolver={resolver}>
        {children}
      </PneumaCraftProvider>
    );
  };
}
