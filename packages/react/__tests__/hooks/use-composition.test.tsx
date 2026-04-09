import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComposition } from '../../src/hooks/use-composition.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { createTestWrapper } from '../helpers.js';

describe('useComposition', () => {
  it('returns null initially', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useComposition(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('returns composition after creation', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ composition: useComposition(), dispatch: useDispatch() }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'composition:create',
        settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
      });
    });

    expect(result.current.composition).not.toBeNull();
    expect(result.current.composition!.settings.width).toBe(1920);
    expect(result.current.composition!.settings.fps).toBe(30);
  });
});
