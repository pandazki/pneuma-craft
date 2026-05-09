import { describe, it, expect, vi } from 'vitest';
import { createTimelineCore } from '../src/timeline-core.js';
import { buildSetPreviewFrameCommand } from '../src/command-handler.js';
import { resolveFrame } from '../src/resolve-frame.js';
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

describe('dispatchEnvelope', () => {
  it('routes a core command to handleCommand with the envelope timestamp', () => {
    const tl = createTimelineCore();
    tl.dispatchEnvelope({
      id: 'cmd-1',
      actor: 'human',
      timestamp: 1712934000000,
      command: {
        type: 'asset:register',
        asset: { id: 'a1', type: 'image', uri: '/x.png', name: 'x', metadata: {} },
      },
    });
    const asset = tl.getCoreState().registry.get('a1');
    expect(asset?.createdAt).toBe(1712934000000);
  });

  it('routes a composition command to handleCompositionCommand', () => {
    const tl = createTimelineCore();
    tl.dispatchEnvelope({
      id: 'create-cmd',
      actor: 'human',
      timestamp: 1000,
      command: {
        type: 'composition:create',
        settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
      },
    });
    const events = tl.dispatchEnvelope({
      id: 'add-track-cmd',
      actor: 'human',
      timestamp: 2000,
      command: {
        type: 'composition:add-track',
        track: {
          id: 'my-track',
          type: 'video',
          name: 'V1',
          clips: [],
          muted: false, volume: 1, locked: false, visible: true,
        },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('composition:track-added');
    expect(events[0].commandId).toBe('add-track-cmd');
    expect(tl.getComposition()?.tracks[0].id).toBe('my-track');
  });

  it('participates in the undo stack correctly', () => {
    const tl = createTimelineCore();
    tl.dispatchEnvelope({
      id: 'cmd-1',
      actor: 'human',
      timestamp: 1000,
      command: {
        type: 'asset:register',
        asset: { type: 'image', uri: '/x.png', name: 'x', metadata: {} },
      },
    });
    expect(tl.canUndo()).toBe(true);
    tl.undo();
    expect(tl.getCoreState().registry.size).toBe(0);
  });

  // ── Preview Frame Workflow (Scenarios A → B → C) ──────────────────

  it('Scenario A → B → C: agent fills timeline with sketches, upgrades, then real clip arrives', () => {
    const tl = createTimelineCore();

    tl.dispatch('agent', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('agent', {
      type: 'composition:add-track',
      track: {
        id: 'vt', type: 'video', name: 'Video', clips: [],
        muted: false, volume: 1, locked: false, visible: true,
      },
    });

    // Register 8 sketch image assets
    const sketchIds: string[] = [];
    for (const t of [0, 2, 4, 6, 8, 10, 12, 14]) {
      const events = tl.dispatch('agent', {
        type: 'asset:register',
        asset: { type: 'image', uri: `/sketch-${t}.png`, name: `Sketch ${t}`, metadata: {} },
      });
      sketchIds.push((events[0].payload.asset as Asset).id);
    }

    // ── Scenario A: agent fills the timeline with 8 sketches ──
    for (let i = 0; i < 8; i++) {
      tl.dispatch('agent', {
        type: 'composition:add-preview-frame',
        trackId: 'vt',
        time: i * 2,
        assetId: sketchIds[i],
      });
    }

    let comp = tl.getComposition()!;
    expect(comp.tracks[0].previewFrames).toHaveLength(8);
    expect(comp.duration).toBe(14);

    // ── Scenario B: agent upgrades sketches at 4s and 8s to anchors ──
    const anchorAt4Events = tl.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/anchor-04.png', name: 'Anchor 04', metadata: {} },
    });
    const anchorAt4 = (anchorAt4Events[0].payload.asset as Asset).id;
    const anchorAt8Events = tl.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/anchor-08.png', name: 'Anchor 08', metadata: {} },
    });
    const anchorAt8 = (anchorAt8Events[0].payload.asset as Asset).id;

    // Use the agent ergonomic helper (upsert by trackId+time)
    const cmd4 = buildSetPreviewFrameCommand(tl.getComposition()!, 'vt', 4, anchorAt4);
    expect(cmd4?.type).toBe('composition:rebind-preview-frame');
    tl.dispatch('agent', cmd4!);

    const cmd8 = buildSetPreviewFrameCommand(tl.getComposition()!, 'vt', 8, anchorAt8);
    tl.dispatch('agent', cmd8!);

    comp = tl.getComposition()!;
    expect(comp.tracks[0].previewFrames.find(p => p.time === 4)?.assetId).toBe(anchorAt4);
    expect(comp.tracks[0].previewFrames.find(p => p.time === 8)?.assetId).toBe(anchorAt8);
    expect(comp.tracks[0].previewFrames.find(p => p.time === 6)?.assetId).toBe(sketchIds[3]);  // unchanged

    // ── Scenario C: agent drops a real clip covering 4–8s, previews let go ──
    const realEvents = tl.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'video', uri: '/real.mp4', name: 'Real', metadata: { duration: 4 } },
    });
    const realVideoId = (realEvents[0].payload.asset as Asset).id;

    tl.dispatch('agent', {
      type: 'composition:add-clip',
      trackId: 'vt',
      clip: {
        assetId: realVideoId, startTime: 4, duration: 4, inPoint: 0, outPoint: 4,
      },
    });

    comp = tl.getComposition()!;
    expect(comp.tracks[0].clips).toHaveLength(1);
    // Preview frame data is preserved (per spec)
    expect(comp.tracks[0].previewFrames).toHaveLength(8);

    // resolveFrame at T=5 (within clip): clip wins
    const f5 = resolveFrame(comp, 5);
    expect(f5.clips).toHaveLength(1);
    expect(f5.previewFrames).toHaveLength(0);

    // resolveFrame at T=3 (no clip): preview shows
    const f3 = resolveFrame(comp, 3);
    expect(f3.clips).toHaveLength(0);
    expect(f3.previewFrames[0].previewFrame.assetId).toBe(sketchIds[1]);  // sketch at t=2

    // resolveFrame at T=10: anchor at t=8 wins (sketch at t=10)
    const f10 = resolveFrame(comp, 10);
    expect(f10.previewFrames[0].previewFrame.assetId).toBe(sketchIds[5]);  // sketch at t=10
  });

  it('Scenario D: undo restores the previous preview frame', () => {
    const tl = createTimelineCore();
    tl.dispatch('agent', {
      type: 'composition:create',
      settings: { width: 1920, height: 1080, fps: 30, aspectRatio: '16:9' },
    });
    tl.dispatch('agent', {
      type: 'composition:add-track',
      track: {
        id: 'vt', type: 'video', name: 'Video', clips: [],
        muted: false, volume: 1, locked: false, visible: true,
      },
    });
    const regEvents = tl.dispatch('agent', {
      type: 'asset:register',
      asset: { type: 'image', uri: '/x.png', name: 'X', metadata: {} },
    });
    const assetId = (regEvents[0].payload.asset as Asset).id;
    tl.dispatch('agent', {
      type: 'composition:add-preview-frame', trackId: 'vt', time: 4, assetId,
    });
    expect(tl.getComposition()!.tracks[0].previewFrames).toHaveLength(1);
    expect(tl.getComposition()!.duration).toBe(4);

    tl.undo();
    expect(tl.getComposition()!.tracks[0].previewFrames).toHaveLength(0);
    expect(tl.getComposition()!.duration).toBe(0);

    tl.redo();
    expect(tl.getComposition()!.tracks[0].previewFrames).toHaveLength(1);
  });
});
