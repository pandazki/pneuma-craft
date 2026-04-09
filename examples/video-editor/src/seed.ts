import type { Actor, CoreCommand, Event } from '@pneuma-craft/core';
import type { CompositionCommand } from '@pneuma-craft/timeline';
import { assetResolver } from './asset-resolver';

type DispatchFn = (actor: Actor, command: CoreCommand | CompositionCommand) => Event[];

interface AssetDef {
  type: 'video' | 'image' | 'audio';
  uri: string;
  name: string;
  metadata: Record<string, unknown>;
}

const ASSET_DEFS: AssetDef[] = [
  // Videos
  { type: 'video', uri: '/assets/video/scene-001.mp4', name: 'Scene 1 -- Opening', metadata: { width: 1080, height: 1920, duration: 5, fps: 30 } },
  { type: 'video', uri: '/assets/video/scene-002.mp4', name: 'Scene 2 -- Explanation', metadata: { width: 1080, height: 1920, duration: 6, fps: 30 } },
  { type: 'video', uri: '/assets/video/scene-003.mp4', name: 'Scene 3 -- Conclusion', metadata: { width: 1080, height: 1920, duration: 4, fps: 30 } },
  // Thumbnails
  { type: 'image', uri: '/assets/images/thumb_scene-001.png', name: 'Thumbnail 1', metadata: { width: 1080, height: 1920 } },
  { type: 'image', uri: '/assets/images/thumb_scene-002.png', name: 'Thumbnail 2', metadata: { width: 1080, height: 1920 } },
  { type: 'image', uri: '/assets/images/thumb_scene-003.png', name: 'Thumbnail 3', metadata: { width: 1080, height: 1920 } },
  // Audio (TTS narration)
  { type: 'audio', uri: '/assets/audio/scene-001.mp3', name: 'Narration 1', metadata: { duration: 5 } },
  { type: 'audio', uri: '/assets/audio/scene-002.mp3', name: 'Narration 2', metadata: { duration: 6 } },
  { type: 'audio', uri: '/assets/audio/scene-003.mp3', name: 'Narration 3', metadata: { duration: 4 } },
];

function extractAssetId(events: Event[]): string {
  const registered = events.find((e) => e.type === 'asset:registered');
  if (!registered) throw new Error('Expected asset:registered event');
  return (registered.payload as { asset: { id: string } }).asset.id;
}

/**
 * Seeds the pneuma-craft store with demo assets, composition, tracks, clips,
 * and provenance relationships.
 */
export function seedDemoData(dispatch: DispatchFn): void {
  const actor: Actor = 'human';

  // ── Register all assets and collect IDs ────────────────────────────
  const assetIds: string[] = [];
  for (const def of ASSET_DEFS) {
    const events = dispatch(actor, {
      type: 'asset:register',
      asset: {
        type: def.type,
        uri: def.uri,
        name: def.name,
        metadata: def.metadata,
      },
    });
    const id = extractAssetId(events);
    assetIds.push(id);
    // Register the ID -> URL mapping for the asset resolver
    assetResolver.register(id, def.uri);
  }

  const videoIds = assetIds.slice(0, 3);
  const imageIds = assetIds.slice(3, 6);
  const audioIds = assetIds.slice(6, 9);

  // ── Create composition ─────────────────────────────────────────────
  dispatch(actor, {
    type: 'composition:create',
    settings: {
      width: 1080,
      height: 1920,
      fps: 30,
      aspectRatio: '9:16',
    },
  });

  // ── Add video track ────────────────────────────────────────────────
  const videoTrackEvents = dispatch(actor, {
    type: 'composition:add-track',
    track: {
      type: 'video',
      name: 'Video Track',
      clips: [],
      muted: false,
      volume: 1,
      locked: false,
    },
  });
  const videoTrackId = extractTrackId(videoTrackEvents);

  // ── Add audio track ────────────────────────────────────────────────
  const audioTrackEvents = dispatch(actor, {
    type: 'composition:add-track',
    track: {
      type: 'audio',
      name: 'Audio Track',
      clips: [],
      muted: false,
      volume: 1,
      locked: false,
    },
  });
  const audioTrackId = extractTrackId(audioTrackEvents);

  // ── Add clips ──────────────────────────────────────────────────────
  const durations = [5, 6, 4];
  let startTime = 0;
  for (let i = 0; i < 3; i++) {
    const d = durations[i];
    dispatch(actor, {
      type: 'composition:add-clip',
      trackId: videoTrackId,
      clip: {
        assetId: videoIds[i],
        startTime,
        duration: d,
        inPoint: 0,
        outPoint: d,
      },
    });
    dispatch(actor, {
      type: 'composition:add-clip',
      trackId: audioTrackId,
      clip: {
        assetId: audioIds[i],
        startTime,
        duration: d,
        inPoint: 0,
        outPoint: d,
      },
    });
    startTime += d;
  }

  // ── Provenance: each video derives from its thumbnail ──────────────
  for (let i = 0; i < 3; i++) {
    dispatch(actor, {
      type: 'provenance:set-root',
      assetId: imageIds[i],
      operation: {
        type: 'upload',
        actor: 'human',
        label: `Uploaded thumbnail ${i + 1}`,
        timestamp: Date.now(),
      },
    });

    dispatch(actor, {
      type: 'provenance:link',
      fromAssetId: imageIds[i],
      toAssetId: videoIds[i],
      operation: {
        type: 'generate',
        actor: 'agent',
        agentId: 'wuxiao-video-gen',
        label: `Generated video from thumbnail ${i + 1}`,
        timestamp: Date.now(),
      },
    });
  }
}

function extractTrackId(events: Event[]): string {
  const added = events.find((e) => e.type === 'composition:track-added');
  if (!added) throw new Error('Expected composition:track-added event');
  return (added.payload as { track: { id: string } }).track.id;
}
