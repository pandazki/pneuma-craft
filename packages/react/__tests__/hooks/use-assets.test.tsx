import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAssets, useAsset } from '../../src/hooks/use-assets.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { createTestWrapper } from '../helpers.js';

describe('useAssets', () => {
  it('returns empty array initially', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useAssets(), { wrapper });
    expect(result.current).toEqual([]);
  });

  it('returns assets after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ assets: useAssets(), dispatch: useDispatch() }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: {
          type: 'video',
          uri: '/test.mp4',
          name: 'Test Video',
          metadata: { width: 1920, height: 1080, duration: 10 },
        },
      });
    });

    expect(result.current.assets).toHaveLength(1);
    expect(result.current.assets[0].name).toBe('Test Video');
  });
});

describe('useAsset', () => {
  it('returns undefined for unknown id', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useAsset('nonexistent'), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it('returns asset by id after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => {
        const assets = useAssets();
        const dispatch = useDispatch();
        const firstId = assets.length > 0 ? assets[0].id : '';
        const asset = useAsset(firstId);
        return { assets, dispatch, asset };
      },
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: {
          type: 'video',
          uri: '/test.mp4',
          name: 'Test Video',
          metadata: {},
        },
      });
    });

    expect(result.current.asset).toBeDefined();
    expect(result.current.asset!.name).toBe('Test Video');
  });
});
