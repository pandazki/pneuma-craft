import { describe, it, expect, vi } from 'vitest';
import { createTimelineCore } from '../src/timeline-core.js';
import type { Asset } from '@pneuma-craft/core';

describe('TimelineCore', () => {
  it('starts with empty core state and null composition', () => {
    const tl = createTimelineCore();
    expect(tl.getCoreState().registry.size).toBe(0);
    expect(tl.getComposition()).toBeNull();
  });

  it('dispatches core commands (asset:register)', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    expect(tl.getCoreState().registry.size).toBe(1);
  });

  it('dispatches composition commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    expect(tl.getComposition()).not.toBeNull();
    expect(tl.getComposition()!.settings.fps).toBe(30);
  });

  it('undo reverses composition commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });
    expect(tl.getComposition()!.tracks).toHaveLength(1);
    tl.undo();
    expect(tl.getComposition()!.tracks).toHaveLength(0);
    tl.redo();
    expect(tl.getComposition()!.tracks).toHaveLength(1);
  });

  it('undo reverses core commands', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    expect(tl.getCoreState().registry.size).toBe(1);
    tl.undo();
    expect(tl.getCoreState().registry.size).toBe(0);
  });

  it('subscribe notifies on all events', () => {
    const tl = createTimelineCore();
    const listener = vi.fn();
    tl.subscribe(listener);
    tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('cross-package validation: add-clip checks core registry', () => {
    const tl = createTimelineCore();
    tl.dispatch('human', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('human', {
      type: 'composition:add-track',
      track: { type: 'video', name: 'V1', clips: [], muted: false, volume: 1, locked: false, visible: true },
    });
    const trackId = tl.getComposition()!.tracks[0].id;

    expect(() => tl.dispatch('human', {
      type: 'composition:add-clip', trackId,
      clip: { assetId: 'nonexistent', startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    })).toThrow();

    const [registered] = tl.dispatch('human', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/t.mp4', name: 'T', metadata: {} },
    });
    const assetId = (registered.payload.asset as Asset).id;

    tl.dispatch('human', {
      type: 'composition:add-clip', trackId,
      clip: { assetId, startTime: 0, duration: 5, inPoint: 0, outPoint: 5 },
    });
    expect(tl.getComposition()!.tracks[0].clips).toHaveLength(1);
  });

  describe('full workflow: create → add tracks → add clips → split → undo', () => {
    it('works end-to-end', () => {
      const tl = createTimelineCore();

      const [reg] = tl.dispatch('human', {
        type: 'asset:register',
        asset: { type: 'video', uri: '/clip.mp4', name: 'Clip', metadata: { duration: 30 } },
      });
      const assetId = (reg.payload.asset as Asset).id;

      tl.dispatch('human', {
        type: 'composition:create',
        settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
      });

      tl.dispatch('human', {
        type: 'composition:add-track',
        track: { type: 'video', name: 'Main', clips: [], muted: false, volume: 1, locked: false, visible: true },
      });
      const trackId = tl.getComposition()!.tracks[0].id;

      tl.dispatch('human', {
        type: 'composition:add-clip', trackId,
        clip: { assetId, startTime: 0, duration: 10, inPoint: 0, outPoint: 10 },
      });
      expect(tl.getComposition()!.duration).toBe(10);

      const clipId = tl.getComposition()!.tracks[0].clips[0].id;
      tl.dispatch('human', { type: 'composition:split-clip', clipId, time: 5 });
      expect(tl.getComposition()!.tracks[0].clips).toHaveLength(2);

      tl.undo();
      expect(tl.getComposition()!.tracks[0].clips).toHaveLength(1);
      expect(tl.getComposition()!.tracks[0].clips[0].duration).toBe(10);
    });
  });
});
