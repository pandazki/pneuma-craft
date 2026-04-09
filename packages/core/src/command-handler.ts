import type {
  PneumaCraftCoreState,
  CommandEnvelope,
  Event,
  CoreCommand,
  Asset,
} from './types.js';
import { generateId } from './id.js';

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

function makeEvent(
  envelope: CommandEnvelope,
  type: string,
  payload: Record<string, unknown>,
): Event {
  return {
    id: generateId(),
    commandId: envelope.id,
    actor: envelope.actor,
    timestamp: envelope.timestamp,
    type,
    payload,
  };
}

function requireAsset(state: PneumaCraftCoreState, assetId: string): Asset {
  const asset = state.registry.get(assetId);
  if (!asset) {
    throw new CommandValidationError(`Asset not found: ${assetId}`);
  }
  return asset;
}

export function handleCommand(
  state: PneumaCraftCoreState,
  envelope: CommandEnvelope,
): Event[] {
  const { command } = envelope;

  switch (command.type) {
    // ── Asset commands ──────────────────────────────────────
    case 'asset:register': {
      const asset: Asset = {
        ...command.asset,
        id: generateId(),
        createdAt: envelope.timestamp,
      };
      return [makeEvent(envelope, 'asset:registered', { asset })];
    }

    case 'asset:remove': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:removed', { assetId: command.assetId, asset })];
    }

    case 'asset:update-metadata': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:metadata-updated', {
        assetId: command.assetId,
        metadata: command.metadata,
        previousMetadata: asset.metadata,
      })];
    }

    case 'asset:tag': {
      const asset = requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'asset:tagged', {
        assetId: command.assetId,
        tags: command.tags,
        previousTags: asset.tags,
      })];
    }

    // ── Provenance commands ────────────────────────────────
    case 'provenance:set-root': {
      requireAsset(state, command.assetId);
      return [makeEvent(envelope, 'provenance:root-set', {
        assetId: command.assetId,
        operation: command.operation,
        edgeId: generateId(),
      })];
    }

    case 'provenance:link': {
      if (command.fromAssetId !== null) {
        requireAsset(state, command.fromAssetId);
      }
      requireAsset(state, command.toAssetId);

      // Cycle detection: BFS up from fromAssetId — if we reach toAssetId, it's a cycle
      if (command.fromAssetId !== null) {
        const visited = new Set<string>();
        const queue = [command.fromAssetId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          if (current === command.toAssetId) {
            throw new CommandValidationError(
              `Provenance link would create a cycle: ${command.toAssetId} is an ancestor of ${command.fromAssetId}`,
            );
          }
          if (visited.has(current)) continue;
          visited.add(current);
          const node = state.provenance.nodes.get(current);
          if (node) queue.push(...node.parentIds);
        }
      }

      return [makeEvent(envelope, 'provenance:linked', {
        edgeId: generateId(),
        fromAssetId: command.fromAssetId,
        toAssetId: command.toAssetId,
        operation: command.operation,
      })];
    }

    case 'provenance:unlink': {
      const edge = state.provenance.edges.get(command.edgeId);
      if (!edge) {
        throw new CommandValidationError(`Provenance edge not found: ${command.edgeId}`);
      }
      return [makeEvent(envelope, 'provenance:unlinked', {
        edgeId: command.edgeId,
        edge,
      })];
    }

    // ── Selection commands ─────────────────────────────────
    case 'selection:set': {
      return [makeEvent(envelope, 'selection:set', {
        selection: command.selection,
        previousSelection: state.selection,
      })];
    }

    case 'selection:clear': {
      return [makeEvent(envelope, 'selection:cleared', {
        previousSelection: state.selection,
      })];
    }

    default:
      throw new CommandValidationError(`Unknown command type: ${(command as CoreCommand).type}`);
  }
}
