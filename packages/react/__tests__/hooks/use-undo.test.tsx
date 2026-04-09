import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndo } from '../../src/hooks/use-undo.js';
import { useDispatch } from '../../src/hooks/use-dispatch.js';
import { useAssets } from '../../src/hooks/use-assets.js';
import { createTestWrapper } from '../helpers.js';

describe('useUndo', () => {
  it('starts with canUndo and canRedo false', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useUndo(), { wrapper });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('canUndo becomes true after dispatch', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ undo: useUndo(), dispatch: useDispatch() }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
      });
    });

    expect(result.current.undo.canUndo).toBe(true);
  });

  it('undo reverses the last action', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ undo: useUndo(), dispatch: useDispatch(), assets: useAssets() }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
      });
    });

    expect(result.current.assets).toHaveLength(1);

    act(() => {
      result.current.undo.undo();
    });

    expect(result.current.assets).toHaveLength(0);
    expect(result.current.undo.canRedo).toBe(true);
  });

  it('redo reapplies the undone action', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(
      () => ({ undo: useUndo(), dispatch: useDispatch(), assets: useAssets() }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'video', uri: '/test.mp4', name: 'Test', metadata: {} },
      });
    });

    act(() => {
      result.current.undo.undo();
    });

    expect(result.current.assets).toHaveLength(0);

    act(() => {
      result.current.undo.redo();
    });

    expect(result.current.assets).toHaveLength(1);
  });
});
