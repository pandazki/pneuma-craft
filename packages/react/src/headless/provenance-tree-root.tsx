import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getTree, type ProvenanceTreeNode as CoreTreeNode } from '@pneuma-craft/core';
import { usePneumaCraftStore } from '../context.js';

export interface ProvenanceTreeNode {
  readonly assetId: string;
  readonly children: ProvenanceTreeNode[];
  readonly expanded: boolean;
}

export interface ProvenanceTreeState {
  readonly tree: ProvenanceTreeNode | null;
  readonly expandNode: (assetId: string) => void;
  readonly collapseNode: (assetId: string) => void;
  readonly toggleNode: (assetId: string) => void;
}

export interface ProvenanceTreeRootProps {
  assetId: string;
  children: (state: ProvenanceTreeState) => React.ReactNode;
}

function buildDisplayTree(
  coreNode: CoreTreeNode,
  expandedSet: ReadonlySet<string>,
): ProvenanceTreeNode {
  const expanded = expandedSet.has(coreNode.assetId);
  return {
    assetId: coreNode.assetId,
    expanded,
    children: expanded
      ? coreNode.children.map((child) => buildDisplayTree(child, expandedSet))
      : [],
  };
}

export function ProvenanceTreeRoot({ assetId, children }: ProvenanceTreeRootProps) {
  const coreState = usePneumaCraftStore((s) => s.coreState);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set([assetId]));

  useEffect(() => {
    setExpandedNodes(new Set([assetId]));
  }, [assetId]);

  const coreTree = useMemo(() => getTree(coreState, assetId), [coreState, assetId]);

  const tree = useMemo(
    () => (coreTree ? buildDisplayTree(coreTree, expandedNodes) : null),
    [coreTree, expandedNodes],
  );

  const expandNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const collapseNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return <>{children({ tree, expandNode, collapseNode, toggleNode })}</>;
}
