import { describe, it, expect, vi } from 'vitest';
import { createFrameRenderer } from '../src/frame-renderer.js';
import {
  createMockMediaDecoder,
  createMockCompositor,
  createMockComposition,
  createMockTrack,
  createMockClip,
  createMockPreviewFrame,
  createMockCanvasImageSource,
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

  it('still renders picture for muted tracks — muted is audio-only, visible controls picture', async () => {
    // As of @pneuma-craft/timeline@0.3.0, `muted` and `visible` are
    // orthogonal: muting a video track silences its audio but keeps the
    // picture on screen. Hiding requires `visible: false`.
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 10, inPoint: 0 });
    const mutedTrack = createMockTrack({ id: 'track-1', type: 'video', clips: [clip], muted: true });
    const composition = createMockComposition({ tracks: [mutedTrack], duration: 10 });

    await renderer.renderFrame(composition, 5);

    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('asset-1', 5, 1920, 1080);
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
  });

  it('skips picture for tracks with visible:false — this is the picture opt-out', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clip = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 10, inPoint: 0 });
    const hiddenTrack = createMockTrack({ id: 'track-1', type: 'video', clips: [clip], visible: false });
    const composition = createMockComposition({ tracks: [hiddenTrack], duration: 10 });

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

  it('ignores clip volume for visual opacity — volume is audio only', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const clipWithVolume = createMockClip({ id: 'clip-1', assetId: 'asset-1', trackId: 'track-1', startTime: 0, duration: 5, inPoint: 0, volume: 0.5 });
    const track = createMockTrack({ id: 'track-1', type: 'video', clips: [clipWithVolume] });
    const composition = createMockComposition({ tracks: [track], duration: 5 });

    await renderer.renderFrame(composition, 2);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    // clip.volume should NOT affect visual opacity — opacity is always 1
    expect(layers[0].opacity).toBe(1);
  });

  it('destroy calls decoder.destroy and compositor.destroy', () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    renderer.destroy();

    expect(decoder.destroy).toHaveBeenCalledOnce();
    expect(compositor.destroy).toHaveBeenCalledOnce();
  });

  // ── Image overlay pattern (main video + timed overlay image) ──────────

  it('main video + image overlay — overlay layer appears only in its time window, above main', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    // Main video track — full 10s
    const mainClip = createMockClip({
      id: 'main-clip', assetId: 'video-asset', trackId: 'main',
      startTime: 0, duration: 10, inPoint: 0, outPoint: 10,
    });
    const mainTrack = createMockTrack({ id: 'main', type: 'video', clips: [mainClip] });

    // Overlay track — static image at [3, 5). Image clips live on video tracks;
    // inPoint/outPoint are ignored by the decoder (single ImageBitmap).
    const overlayClip = createMockClip({
      id: 'overlay-clip', assetId: 'image-asset', trackId: 'overlay',
      startTime: 3, duration: 2, inPoint: 0, outPoint: 0,
    });
    const overlayTrack = createMockTrack({ id: 'overlay', type: 'video', clips: [overlayClip] });

    const composition = createMockComposition({
      tracks: [mainTrack, overlayTrack],
      duration: 10,
    });

    // Before overlay window (t=2): only main layer
    await renderer.renderFrame(composition, 2);
    let [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
    expect(decoder.decodeVideoFrame).toHaveBeenLastCalledWith('video-asset', 2, 1920, 1080);

    vi.mocked(compositor.composite).mockClear();
    vi.mocked(decoder.decodeVideoFrame).mockClear();

    // Inside overlay window (t=4): both layers, overlay on top (higher zIndex)
    await renderer.renderFrame(composition, 4);
    [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(2);
    expect(layers[0].zIndex).toBe(0); // main
    expect(layers[1].zIndex).toBe(1); // overlay (later track = higher zIndex)
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('video-asset', 4, 1920, 1080);
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('image-asset', 1, 1920, 1080);
    //                                                                  ^ localTime = 4 - 3 = 1 (ignored by image decoder)

    vi.mocked(compositor.composite).mockClear();
    vi.mocked(decoder.decodeVideoFrame).mockClear();

    // After overlay window (t=6): only main layer
    await renderer.renderFrame(composition, 6);
    [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
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

  // ── Subtitle pipeline ────────────────────────────────────────────────
  //
  // These tests pin down the contract for `SubtitleRenderer`: that preview
  // and export go through the SAME FrameRenderer code path, so if a renderer
  // is wired in, subtitles are composited consistently in both.

  it('skips subtitle tracks when no SubtitleRenderer is provided — legacy behavior preserved', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const subClip = createMockClip({
      id: 'sub-1', assetId: 'sub-asset', trackId: 'sub-track',
      startTime: 0, duration: 5, inPoint: 0, text: 'hello',
    });
    const subTrack = createMockTrack({ id: 'sub-track', type: 'subtitle', clips: [subClip] });
    const composition = createMockComposition({ tracks: [subTrack], duration: 5 });

    await renderer.renderFrame(composition, 2);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('invokes SubtitleRenderer for each active subtitle clip with clip, localTime, and dimensions', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const subImage = createMockCanvasImageSource();
    const subtitleRenderer = vi.fn().mockResolvedValue(subImage);

    const renderer = createFrameRenderer(
      decoder, compositor, 1920, 1080, subtitleRenderer,
    );

    const subClip = createMockClip({
      id: 'sub-1', assetId: 'sub-asset', trackId: 'sub-track',
      startTime: 3, duration: 5, inPoint: 0, text: 'hello world',
    });
    const subTrack = createMockTrack({ id: 'sub-track', type: 'subtitle', clips: [subClip] });
    const composition = createMockComposition({ tracks: [subTrack], duration: 10 });

    // Query at t=5 → localTime = 0 + (5 - 3) = 2
    await renderer.renderFrame(composition, 5);

    expect(subtitleRenderer).toHaveBeenCalledTimes(1);
    expect(subtitleRenderer).toHaveBeenCalledWith({
      clip: subClip,
      localTime: 2,
      width: 1920,
      height: 1080,
    });

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
    expect(layers[0].source).toBe(subImage);
  });

  it('composites subtitles ABOVE video layers — subtitles always win zIndex', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const subImage = createMockCanvasImageSource();
    const subtitleRenderer = vi.fn().mockResolvedValue(subImage);

    const renderer = createFrameRenderer(
      decoder, compositor, 1920, 1080, subtitleRenderer,
    );

    // Two video tracks, one subtitle track — subtitle must land on top
    const vClip1 = createMockClip({
      id: 'v1', assetId: 'va1', trackId: 'vt1',
      startTime: 0, duration: 10, inPoint: 0,
    });
    const vClip2 = createMockClip({
      id: 'v2', assetId: 'va2', trackId: 'vt2',
      startTime: 0, duration: 10, inPoint: 0,
    });
    const subClip = createMockClip({
      id: 's1', assetId: 'sa1', trackId: 'st1',
      startTime: 0, duration: 10, inPoint: 0, text: 'hi',
    });

    const vTrack1 = createMockTrack({ id: 'vt1', type: 'video', clips: [vClip1] });
    const vTrack2 = createMockTrack({ id: 'vt2', type: 'video', clips: [vClip2] });
    const subTrack = createMockTrack({ id: 'st1', type: 'subtitle', clips: [subClip] });

    const composition = createMockComposition({
      // Intentionally put subtitle track FIRST in the list to verify the
      // renderer re-orders subtitles on top regardless of track order.
      tracks: [subTrack, vTrack1, vTrack2],
      duration: 10,
    });

    await renderer.renderFrame(composition, 1);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(3);
    // First two layers are the videos (zIndex 0, 1)
    expect(layers[0].zIndex).toBe(0);
    expect(layers[1].zIndex).toBe(1);
    // Subtitle sits on top (zIndex 2)
    expect(layers[2].zIndex).toBe(2);
    expect(layers[2].source).toBe(subImage);
  });

  it('supports SubtitleRenderer returning null — null layers are skipped, not pushed as empty', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const subtitleRenderer = vi.fn().mockResolvedValue(null);

    const renderer = createFrameRenderer(
      decoder, compositor, 1920, 1080, subtitleRenderer,
    );

    const subClip = createMockClip({
      id: 'sub-1', assetId: 'sub-asset', trackId: 'sub-track',
      startTime: 0, duration: 5, inPoint: 0, text: '',
    });
    const subTrack = createMockTrack({ id: 'sub-track', type: 'subtitle', clips: [subClip] });
    const composition = createMockComposition({ tracks: [subTrack], duration: 5 });

    await renderer.renderFrame(composition, 2);

    expect(subtitleRenderer).toHaveBeenCalledOnce();
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('supports synchronous SubtitleRenderer — not every caller needs async', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const subImage = createMockCanvasImageSource();
    // Return value directly instead of a promise.
    const subtitleRenderer = vi.fn(() => subImage);

    const renderer = createFrameRenderer(
      decoder, compositor, 1920, 1080, subtitleRenderer,
    );

    const subClip = createMockClip({
      id: 'sub-1', assetId: 'sub-asset', trackId: 'sub-track',
      startTime: 0, duration: 5, inPoint: 0, text: 'sync',
    });
    const subTrack = createMockTrack({ id: 'sub-track', type: 'subtitle', clips: [subClip] });
    const composition = createMockComposition({ tracks: [subTrack], duration: 5 });

    await renderer.renderFrame(composition, 2);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
    expect(layers[0].source).toBe(subImage);
  });

  // ── Preview frames ─────────────────────────────────────────────────

  it('preview frame renders when includePreviewFrames=true and no clip covers T', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      includePreviewFrames: true,
    });

    const pf = createMockPreviewFrame({ id: 'pf-1', trackId: 'vt', time: 4, assetId: 'sketch-asset' });
    const track = createMockTrack({ id: 'vt', type: 'video', previewFrames: [pf] });
    const composition = createMockComposition({ tracks: [track], duration: 14 });

    await renderer.renderFrame(composition, 5);

    // Preview frame's image asset is decoded with localTime=0 (image fast path)
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('sketch-asset', 0, 1920, 1080);
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(1);
  });

  it('preview frame is suppressed when includePreviewFrames=false (export default)', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      includePreviewFrames: false,
    });

    const pf = createMockPreviewFrame({ id: 'pf-1', trackId: 'vt', time: 4, assetId: 'sketch-asset' });
    const track = createMockTrack({ id: 'vt', type: 'video', previewFrames: [pf] });
    const composition = createMockComposition({ tracks: [track], duration: 14 });

    await renderer.renderFrame(composition, 5);

    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(0);
  });

  it('default (no options) does not render preview frames', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080);

    const pf = createMockPreviewFrame({ id: 'pf-1', trackId: 'vt', time: 4, assetId: 'sketch-asset' });
    const track = createMockTrack({ id: 'vt', type: 'video', previewFrames: [pf] });
    const composition = createMockComposition({ tracks: [track], duration: 14 });

    await renderer.renderFrame(composition, 5);

    expect(decoder.decodeVideoFrame).not.toHaveBeenCalled();
  });

  it('clip wins over preview on the same track at the same time (let-go)', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      includePreviewFrames: true,
    });

    const clip = createMockClip({
      id: 'real', assetId: 'real-asset', trackId: 'vt',
      startTime: 4, duration: 4, inPoint: 0, outPoint: 4,
    });
    const pf = createMockPreviewFrame({ id: 'pf-1', trackId: 'vt', time: 4, assetId: 'sketch-asset' });
    const track = createMockTrack({ id: 'vt', type: 'video', clips: [clip], previewFrames: [pf] });
    const composition = createMockComposition({ tracks: [track], duration: 8 });

    // T=5 (covered by clip): only clip rendered, preview suppressed
    await renderer.renderFrame(composition, 5);
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('real-asset', 1, 1920, 1080);
    expect(decoder.decodeVideoFrame).not.toHaveBeenCalledWith('sketch-asset', 0, 1920, 1080);

    vi.mocked(decoder.decodeVideoFrame).mockClear();
    vi.mocked(compositor.composite).mockClear();

    // T=8 (just past clip end, preview at t=4 still wins as the most-recent ≤ T)
    await renderer.renderFrame(composition, 8);
    expect(decoder.decodeVideoFrame).toHaveBeenCalledWith('sketch-asset', 0, 1920, 1080);
  });

  it('multi-track z-order: lower track clip + upper track preview → preview drawn on top', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      includePreviewFrames: true,
    });

    const lowerClip = createMockClip({
      id: 'lower-clip', assetId: 'lower-video', trackId: 'lower',
      startTime: 0, duration: 10, inPoint: 0,
    });
    const lowerTrack = createMockTrack({ id: 'lower', type: 'video', clips: [lowerClip] });

    const upperPf = createMockPreviewFrame({
      id: 'upper-pf', trackId: 'upper', time: 0, assetId: 'upper-image',
    });
    const upperTrack = createMockTrack({ id: 'upper', type: 'video', previewFrames: [upperPf] });

    const composition = createMockComposition({
      tracks: [lowerTrack, upperTrack],
      duration: 10,
    });

    await renderer.renderFrame(composition, 5);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(2);
    // zIndex 0 = lower track (clip); zIndex 1 = upper track (preview)
    expect(layers[0].zIndex).toBe(0);
    expect(layers[1].zIndex).toBe(1);
    expect(decoder.decodeVideoFrame).toHaveBeenNthCalledWith(1, 'lower-video', 5, 1920, 1080);
    expect(decoder.decodeVideoFrame).toHaveBeenNthCalledWith(2, 'upper-image', 0, 1920, 1080);
  });

  it('reordering composition.tracks reorders preview-vs-clip z-stacking accordingly', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      includePreviewFrames: true,
    });

    const clip = createMockClip({
      id: 'c', assetId: 'video-asset', trackId: 'A',
      startTime: 0, duration: 10, inPoint: 0,
    });
    const pf = createMockPreviewFrame({ id: 'pf', trackId: 'B', time: 0, assetId: 'image-asset' });
    const trackA = createMockTrack({ id: 'A', type: 'video', clips: [clip] });
    const trackB = createMockTrack({ id: 'B', type: 'video', previewFrames: [pf] });

    // A above B → clip on top
    let composition = createMockComposition({ tracks: [trackB, trackA], duration: 10 });
    await renderer.renderFrame(composition, 5);
    let calls = vi.mocked(decoder.decodeVideoFrame).mock.calls;
    expect(calls[0][0]).toBe('image-asset');
    expect(calls[1][0]).toBe('video-asset');

    vi.mocked(decoder.decodeVideoFrame).mockClear();

    // B above A → preview on top
    composition = createMockComposition({ tracks: [trackA, trackB], duration: 10 });
    await renderer.renderFrame(composition, 5);
    calls = vi.mocked(decoder.decodeVideoFrame).mock.calls;
    expect(calls[0][0]).toBe('video-asset');
    expect(calls[1][0]).toBe('image-asset');
  });

  it('subtitles still composite ABOVE preview frame layers', async () => {
    const decoder = createMockMediaDecoder();
    const compositor = createMockCompositor();
    const subImage = createMockCanvasImageSource();
    const subtitleRenderer = vi.fn().mockResolvedValue(subImage);
    const renderer = createFrameRenderer(decoder, compositor, 1920, 1080, {
      subtitleRenderer,
      includePreviewFrames: true,
    });

    const pf = createMockPreviewFrame({ id: 'pf', trackId: 'vt', time: 0, assetId: 'image-asset' });
    const videoTrack = createMockTrack({ id: 'vt', type: 'video', previewFrames: [pf] });
    const subClip = createMockClip({
      id: 's', assetId: 'sub-asset', trackId: 'st',
      startTime: 0, duration: 10, inPoint: 0, text: 'sub',
    });
    const subTrack = createMockTrack({ id: 'st', type: 'subtitle', clips: [subClip] });
    const composition = createMockComposition({
      tracks: [videoTrack, subTrack], duration: 10,
    });

    await renderer.renderFrame(composition, 5);

    const [[layers]] = vi.mocked(compositor.composite).mock.calls;
    expect(layers).toHaveLength(2);
    expect(layers[0].zIndex).toBe(0);   // preview
    expect(layers[1].zIndex).toBe(1);   // subtitle on top
    expect(layers[1].source).toBe(subImage);
  });
});
