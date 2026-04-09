import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { useAssets } from '../../src/hooks/use-assets.js';
import { createTestWrapper } from '../helpers.js';

describe('useDispatch', () => {
  it('returns a stable function', () => {
    const wrapper = createTestWrapper();
    const { result, rerender } = renderHook(() => useDispatch(), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('returns events on dispatch', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useDispatch(), { wrapper });

    let events: unknown[];
    act(() => {
      events = result.current('human', {
        type: 'asset:register',
        asset: {
          type: 'video',
          uri: '/test.mp4',
          name: 'Test Video',
          metadata: {},
        },
      });
    });

    expect(events!).toBeDefined();
    expect(events!.length).toBeGreaterThan(0);
  });

  it('updates state after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ assets: useAssets(), dispatch: useDispatch() }),
      { wrapper },
    );

    expect(result.current.assets).toHaveLength(0);

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: {
          type: 'image',
          uri: '/photo.png',
          name: 'Photo',
          metadata: { width: 800, height: 600 },
        },
      });
    });

    expect(result.current.assets).toHaveLength(1);
    expect(result.current.assets[0].type).toBe('image');
  });
});
