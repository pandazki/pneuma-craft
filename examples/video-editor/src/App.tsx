import { useCallback, useEffect, useRef, useState } from 'react';
import { PneumaCraftProvider, useDispatch, useAssets, useComposition } from '@pneuma-craft/react';
import {
  Timeline, AssetLibrary, ProvenanceTree,
  Panel, Button, IconButton,
} from '@pneuma-craft/react-ui';
import '@pneuma-craft/react-ui/styles';
import { assetResolver } from './asset-resolver';
import { seedDemoData } from './seed';
import { NativePreview } from './NativePreview';
import './App.css';

function EditorContent() {
  const dispatch = useDispatch();
  const assets = useAssets();
  const composition = useComposition();
  const seededRef = useRef(false);
  const [selectedRootAssetId, setSelectedRootAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    seedDemoData(dispatch);
  }, [dispatch]);

  // Pick the first image asset as the provenance tree root (if available)
  const imageAssets = assets.filter((a) => a.type === 'image');
  const provenanceRootId = selectedRootAssetId ?? imageAssets[0]?.id ?? null;

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
          <IconButton icon="undo" label="Undo" />
          <IconButton icon="redo" label="Redo" />
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

      {/* ── Left sidebar bottom: Provenance ────────────────── */}
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
      </aside>

      {/* ── Bottom: Timeline ───────────────────────────────── */}
      <section className="editor-timeline">
        <Timeline defaultPixelsPerSecond={60} />
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
