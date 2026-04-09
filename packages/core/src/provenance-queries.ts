import type { PneumaCraftCoreState, Asset, Actor, ProvenanceEdge, ProvenanceNode } from './types.js';

/**
 * Primary lineage: follows first parent at each level.
 * Use for simple "where did this come from?" UI.
 * For full DAG ancestry (multi-parent), use getAncestors.
 */
export function getLineage(state: PneumaCraftCoreState, assetId: string): Asset[] {
  const lineage: Asset[] = [];
  const visited = new Set<string>();
  let current = assetId;

  while (true) {
    const node = state.provenance.nodes.get(current);
    if (!node || node.parentIds.length === 0) break;
    const parentId = node.parentIds[0];
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parentAsset = state.registry.get(parentId);
    if (!parentAsset) break;
    lineage.push(parentAsset);
    current = parentId;
  }

  return lineage;
}

/**
 * All ancestors via BFS. Handles multi-parent DAG (composite operations).
 * Returns deduplicated list of all ancestor assets.
 */
export function getAncestors(state: PneumaCraftCoreState, assetId: string): Asset[] {
  const ancestors: Asset[] = [];
  const visited = new Set<string>();
  const queue: string[] = [];

  const startNode = state.provenance.nodes.get(assetId);
  if (!startNode) return [];
  queue.push(...startNode.parentIds);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const asset = state.registry.get(current);
    if (asset) ancestors.push(asset);
    const node = state.provenance.nodes.get(current);
    if (node) queue.push(...node.parentIds);
  }

  return ancestors;
}

export function getVariants(state: PneumaCraftCoreState, assetId: string): Asset[] {
  const node = state.provenance.nodes.get(assetId);
  if (!node) return [];
  return node.childIds.map(id => state.registry.get(id)).filter((a): a is Asset => a !== undefined);
}

export function getRoots(state: PneumaCraftCoreState): Asset[] {
  const roots: Asset[] = [];
  for (const node of state.provenance.nodes.values()) {
    if (node.parentIds.length === 0) {
      const asset = state.registry.get(node.assetId);
      if (asset) roots.push(asset);
    }
  }
  return roots;
}

export function getOperationsByActor(state: PneumaCraftCoreState, actor: Actor): ProvenanceEdge[] {
  return Array.from(state.provenance.edges.values()).filter(edge => edge.operation.actor === actor);
}

export interface ProvenanceTreeNode {
  readonly assetId: string;
  readonly node: ProvenanceNode;
  readonly children: ProvenanceTreeNode[];
}

export function getTree(state: PneumaCraftCoreState, assetId: string): ProvenanceTreeNode | null {
  const node = state.provenance.nodes.get(assetId);
  if (!node) return null;
  const children = node.childIds.map(id => getTree(state, id)).filter((t): t is ProvenanceTreeNode => t !== null);
  return { assetId, node, children };
}
