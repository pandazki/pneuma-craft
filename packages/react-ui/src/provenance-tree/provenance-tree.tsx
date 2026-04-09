import React, { createContext, useContext } from 'react';
import { ProvenanceTreeRoot } from '@pneuma-craft/react';
import type { ProvenanceTreeState } from '@pneuma-craft/react';
import { ProvenanceTreeNodeView } from './provenance-tree-node.js';
import './provenance-tree.css';

interface ProvenanceTreeContextValue extends ProvenanceTreeState {
  onAssetSelect?: (assetId: string) => void;
}

const ProvenanceTreeContext = createContext<ProvenanceTreeContextValue | null>(null);

export interface ProvenanceTreeProps {
  assetId: string;
  className?: string;
  style?: React.CSSProperties;
  onAssetSelect?: (assetId: string) => void;
  children?: React.ReactNode;
}

function ProvenanceTreeBase({ assetId, className, style, onAssetSelect, children }: ProvenanceTreeProps) {
  return (
    <ProvenanceTreeRoot assetId={assetId}>
      {(state) => (
        <ProvenanceTreeContext.Provider value={{ ...state, onAssetSelect }}>
          <div className={`pc-provenance-tree ${className ?? ''}`} style={style}>
            {children ?? (
              state.tree ? (
                <ProvenanceTreeNodeView
                  node={state.tree}
                  depth={0}
                  onToggle={state.toggleNode}
                  onSelect={onAssetSelect}
                />
              ) : (
                <div className="pc-provenance-empty">No provenance data</div>
              )
            )}
          </div>
        </ProvenanceTreeContext.Provider>
      )}
    </ProvenanceTreeRoot>
  );
}

function CompoundNode() {
  const ctx = useContext(ProvenanceTreeContext);
  if (!ctx || !ctx.tree) return null;
  return <ProvenanceTreeNodeView node={ctx.tree} depth={0} onToggle={ctx.toggleNode} onSelect={ctx.onAssetSelect} />;
}

export const ProvenanceTree = Object.assign(ProvenanceTreeBase, {
  Node: CompoundNode,
});
