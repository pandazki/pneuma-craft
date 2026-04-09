import { describe, it, expect, vi } from 'vitest';
import { createFrameRenderer } from '../src/frame-renderer.js';
import {
  createMockMediaDecoder,
  createMockCompositor,
  createMockComposition,
  createMockTrack,
  createMockClip,
} from './helpers.js';

describe('createFrameRenderer', () => {
  it('creates a frame renderer', () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);
    expect(renderer).toBeDefined();
    expect(typeof renderer.renderFrame).toBe('function');
    expect(typeof renderer.destroy).toBe('function');
  });

  it('renders empty composition (no tracks) — compositor called with empty layers', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const composition = createMockComposition({ tracks: [] });
    const frame = await renderer.renderFrame(composition, 0);

    expect(compositor.composite).toHaveBeenCalledWith([]);
    expect(frame.time).toBe(0);
    expect(frame.width).toBe(1920);
    expect(frame.height).toBe(1080);
    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
  });

  it('renders single video clip — decoder called with correct assetId and localTime', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', startTime: 0, duration: 5, inPoint: 0 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    await renderer.renderFrame(composition, 2);

    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('asset-1', 2, 1920, 1080);
    expect(compositor.composite).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ zIndex: 0 }),
      ]),
    );
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
  });

  it('renders multiple tracks in correct zIndex order', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip1 = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 10, inPoint: 0 });
    const clip2 = createMockClip({ id: 'clip-2', assetId: 'asset-2', trackId: 'track-2', startTime: 0, duration: 10, inPoint: 0 });
    const track1 = createMockTrack({ id: 'track-1', type: 'video', clips: [clip1] });
    const track2 = createMockTrack({ id: 'track-2', type: 'video', clips: [clip2] });
    const composition = createMockComposition({ tracks: [track1, track2], duration: 10 });

    await renderer.renderFrame(composition, 3);

    expect(decoder.decodeVideoFrame).toHaveBeenCalledTimes(2);
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(2);
    expect(layers[0].zIndex).toBe(0);
    expect(layers[1].zIndex).toBe(1);
  });

  it('skips audio tracks — audio clip does not trigger decodeVideoFrame', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const audioClip = createMockClip({ id: 'audio-clip', assetId: 'audio-asset', trackId: 'track-audio', startTime: 0, duration: 10, inPoint: 0 });
    const audioTrack = createMockTrack({ id: 'track-audio', type: 'audio', clips: [audioClip] });
    const composition = createMockComposition({ tracks: [audioTrack], duration: 10 });

    await renderer.renderFrame(composition, 5);

    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('skips muted tracks — resolveFrame excludes them so no decode calls', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 10, inPoint: 0 });
    const mutedTrack = createMockTrack({ id: 'track-1', type: 'video', clips: [clip], muted: true });
    const composition = createMockComposition({ tracks: [mutedTrack], duration: 10 });

    await renderer.renderFrame(composition, 5);

    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('skips clips not active at the requested time', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    // Clip spans [0, 5), querying at time 6 should not decode
    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 5, inPoint: 0 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 10 });

    await renderer.renderFrame(composition, 6);

    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('computes correct localTime — startTime=3, inPoint=2, query at time=5 → localTime=4', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 3, duration: 5, inPoint: 2 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clip] });
    const composition = createMockComposition({ tracks: [track], duration: 10 });

    await renderer.renderFrame(composition, 5);

    // localTime = inPoint + (time - startTime) = 2 + (5 - 3) = 4
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('asset-1', 4, 1920, 1080);
  });

  it('uses track volume as clip opacity, defaulting to 1 if not set', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    // Clip without volume field — should default to 1
    const clipWithoutVolume = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 5, inPoint: 0 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clipWithoutVolume] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    await renderer.renderFrame(composition, 2);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers[0].opacity).toBe(1);
  });

  it('uses clip volume when set', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clipWithVolume = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 5, inPoint: 0, volume: 0.5 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clipWithVolume] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    await renderer.renderFrame(composition, 2);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers[0].opacity).toBe(0.5);
  });

  it('destroy calls decoder.destroy and compositor.destroy', () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    renderer.destroy();

    expect(decoder.destroy).toHaveBeenCalledOnce();
    expect(compositor.destroy).toHaveBeenCalledOnce();
  });

  it('returned frame has correct time, width, and height', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 640, 360);

    const composition = createMockComposition({ tracks: [] });
    const frame = await renderer.renderFrame(composition, 1.5);

    expect(frame.time).toBe(1.5);
    expect(frame.width).toBe(640);
    expect(frame.height).toBe(360);
  });
});
