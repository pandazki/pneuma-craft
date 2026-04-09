import React from 'react';
import type { ProvenanceTreeNode } from '@pneuma-craft/react';
import { ChevronRightIcon } from '../icons.js';
import { useAsset } from '@pneuma-craft/react';

export interface ProvenanceTreeNodeViewProps {
  node: ProvenanceTreeNode;
  depth: number;
  onToggle: (assetId: string) => void;
  onSelect?: (assetId: string) => void;
}

export function ProvenanceTreeNodeView({ node, depth, onToggle, onSelect }: ProvenanceTreeNodeViewProps) {
  const asset = useAsset(node.assetId);

  return (
    <div className="pc-provenance-node">
      <div
        className="pc-provenance-node-row"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect?.(node.assetId)}
      >
        <button
          className={`pc-provenance-node-toggle ${
            node.expanded ? 'pc-provenance-node-toggle--expanded' : ''
          } ${!node.hasChildren ? 'pc-provenance-node-toggle--hidden' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.assetId);
          }}
        >
          <ChevronRightIcon size={12} />
        </button>
        <span className="pc-provenance-node-name">{asset?.name ?? node.assetId}</span>
        {asset && <span className="pc-provenance-node-type">{asset.type}</span>}
      </div>
      {node.expanded && node.children.length > 0 && (
        <div className="pc-provenance-node-children">
          {node.children.map((child) => (
            <ProvenanceTreeNodeView
              key={child.assetId}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
