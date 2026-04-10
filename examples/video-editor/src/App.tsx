import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PneumaCraftProvider, useDispatch, useAssets, useComposition, usePlayback,
  useUndo, useSelection, useEventLog,
} from '@pneuma-craft/react';
import type { Event } from '@pneuma-craft/core';
import {
  Timeline, AssetLibrary, ProvenanceTree,
  Panel, Button, IconButton,
} from '@pneuma-craft/react-ui';
import '@pneuma-craft/react-ui/styles';
import { assetResolver } from './asset-resolver';
import { seedDemoData } from './seed';
import { NativePreview } from './NativePreview';
import './App.css';

function EventLogPanel({ events }: { events: Event[] }) {
  const recent = events.slice(-8).reverse();
  return (
    <div className="event-log">
      {recent.map((e) => (
        <div key={e.id} className="event-log__item">
          <span className="event-log__type">{e.type}</span>
          <span className="event-log__actor">{e.actor}</span>
        </div>
      ))}
      {events.length === 0 && <p className="editor-placeholder">No events yet</p>}
    </div>
  );
}

function EditorContent() {
  const dispatch = useDispatch();
  const assets = useAssets();
  const composition = useComposition();
  const { seek } = usePlayback();
  const { undo, redo, canUndo, canRedo } = useUndo();
  const selection = useSelection();
  const events = useEventLog();
  const seededRef = useRef(false);
  const [selectedRootAssetId, setSelectedRootAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    seedDemoData(dispatch);
  }, [dispatch]);

  // Keyboard shortcuts: Delete, Ctrl+Z, Ctrl+Shift+Z
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.type === 'clip' && selection.ids.length > 0) {
          for (const clipId of selection.ids) {
            dispatch('human', { type: 'composition:remove-clip', clipId });
          }
          dispatch('human', { type: 'selection:clear' });
        }
      }
      // Ctrl+Z / Cmd+Z for undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z for redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection, dispatch, undo, redo]);

  // Clip selection
  const selectedClipIds = selection.type === 'clip' ? selection.ids : [];
  const selectedAssetIds = selection.type === 'asset' ? selection.ids : [];

  const handleClipSelect = useCallback(
    (clipId: string) => {
      dispatch('human', {
        type: 'selection:set',
        selection: { type: 'clip', ids: [clipId] },
      });
    },
    [dispatch],
  );

  // Pick the first image asset as the provenance tree root (if available)
  const imageAssets = assets.filter((a) => a.type === 'image');
  const provenanceRootId = selectedAssetIds[0] ?? selectedRootAssetId ?? imageAssets[0]?.id ?? null;

  const handleClipMove = useCallback(
    (clipId: string, newStartTime: number) => {
      dispatch('human', {
        type: 'composition:move-clip',
        clipId,
        startTime: Math.max(0, newStartTime),
      });
    },
    [dispatch],
  );

  const handleClipSplit = useCallback(
    (clipId: string, time: number) => {
      dispatch('human', {
        type: 'composition:split-clip',
        clipId,
        time,
      });
    },
    [dispatch],
  );

  const handleAddClip = useCallback(
    (assetId: string) => {
      if (!composition) return;
      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return;

      // Only add video or audio assets
      if (asset.type !== 'video' && asset.type !== 'audio') return;

      const track = composition.tracks.find((t) => t.type === asset.type);
      if (!track) return;

      const duration = (asset.metadata as Record<string, unknown>).duration as number ?? 5;

      dispatch('human', {
        type: 'composition:add-clip',
        trackId: track.id,
        clip: {
          assetId: asset.id,
          startTime: composition.duration,
          duration,
          inPoint: 0,
          outPoint: duration,
          text: asset.name,
        },
      });
    },
    [composition, assets, dispatch],
  );

  return (
    <div className="editor-layout">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="editor-header">
        <h1 className="editor-title">pneuma-craft demo</h1>
        <div className="editor-header-actions">
          <IconButton icon="undo" label="Undo" onClick={undo} disabled={!canUndo} />
          <IconButton icon="redo" label="Redo" onClick={redo} disabled={!canRedo} />
          <Button variant="primary">
            Export
          </Button>
        </div>
      </header>

      {/* ── Left sidebar: Asset Library ────────────────────── */}
      <aside className="editor-sidebar-left-top">
        <Panel title="Assets" collapsible>
          <AssetLibrary
            onAssetSelect={(id) => setSelectedRootAssetId(id)}
          />
          <div className="asset-actions">
            <p className="asset-actions__hint">
              Select a video or audio asset above, then click to add it to the timeline.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                if (selectedRootAssetId) handleAddClip(selectedRootAssetId);
              }}
            >
              + Add to Timeline
            </Button>
          </div>
        </Panel>
      </aside>

      {/* ── Center top: Preview ────────────────────────────── */}
      <main className="editor-preview">
        <NativePreview />
      </main>

      {/* ── Left sidebar bottom: Provenance + Event Log ───── */}
      <aside className="editor-sidebar-left-bottom">
        <Panel title="Provenance" collapsible>
          {provenanceRootId ? (
            <ProvenanceTree
              assetId={provenanceRootId}
              onAssetSelect={(id) => setSelectedRootAssetId(id)}
            />
          ) : (
            <p className="editor-placeholder">
              Select an asset to view provenance
            </p>
          )}
        </Panel>
        <Panel title="Activity" collapsible>
          <EventLogPanel events={events} />
        </Panel>
      </aside>

      {/* ── Bottom: Timeline ───────────────────────────────── */}
      <section className="editor-timeline">
        <Timeline
          defaultPixelsPerSecond={60}
          onSeek={seek}
          onClipMove={handleClipMove}
          onClipSplit={handleClipSplit}
          onClipSelect={handleClipSelect}
          selectedClipIds={selectedClipIds}
        />
      </section>
    </div>
  );
}

export function App() {
  return (
    <PneumaCraftProvider assetResolver={assetResolver}>
      <EditorContent />
    </PneumaCraftProvider>
  );
}
