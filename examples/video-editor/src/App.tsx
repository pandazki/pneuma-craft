import { useEffect, useRef, useState } from 'react';
import { PneumaCraftProvider, useDispatch, useAssets } from '@pneuma-craft/react';
import {
  Preview, Timeline, AssetLibrary, ProvenanceTree,
  Panel, Button, IconButton,
} from '@pneuma-craft/react-ui';
import '@pneuma-craft/react-ui/styles';
import { assetResolver } from './asset-resolver';
import { seedDemoData } from './seed';
import './App.css';

function EditorContent() {
  const dispatch = useDispatch();
  const assets = useAssets();
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
        </Panel>
      </aside>

      {/* ── Center top: Preview ────────────────────────────── */}
      <main className="editor-preview">
        <Preview />
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
