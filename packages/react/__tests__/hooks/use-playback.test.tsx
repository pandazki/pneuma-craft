import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayback } from '../../src/hooks/use-playback.js';
import { createTestWrapper } from '../helpers.js';

describe('usePlayback', () => {
  it('returns initial playback state', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    expect(result.current.state).toBe('idle');
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.playbackRate).toBe(1);
    expect(result.current.loop).toBeNull();
  });

  it('play sets state to playing', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => {
      result.current.play();
    });

    expect(result.current.state).toBe('playing');
  });

  it('pause sets state to paused', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => {
      result.current.play();
    });

    act(() => {
      result.current.pause();
    });

    expect(result.current.state).toBe('paused');
  });

  it('seek updates currentTime', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => {
      result.current.seek(5.5);
    });

    expect(result.current.currentTime).toBe(5.5);
  });

  it('setPlaybackRate updates rate', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => {
      result.current.setPlaybackRate(2);
    });

    expect(result.current.playbackRate).toBe(2);
  });

  it('setLoop updates loop range', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => usePlayback(), { wrapper });

    act(() => {
      result.current.setLoop({ start: 1, end: 5 });
    });

    expect(result.current.loop).toEqual({ start: 1, end: 5 });
  });
});
