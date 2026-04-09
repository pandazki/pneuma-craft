import type { Event } from './types.js';
import { asCoreEvent } from './events.js';
import { generateId } from './id.js';

interface UndoEntry {
  readonly commandId: string;
  readonly events: readonly Event[];
}

export interface UndoManager {
  record(commandId: string, events: readonly Event[]): void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

function invertEvent(event: Event): Event {
  const e = asCoreEvent(event);
  const base = {
    id: generateId(),
    commandId: event.commandId,
    actor: event.actor,
    timestamp: Date.now(),
  };

  switch (e.type) {
    case 'asset:registered': {
      const { asset } = e.payload;
      return { ...base, type: 'asset:removed', payload: { assetId: asset.id, asset } };
    }
    case 'asset:removed': {
      return { ...base, type: 'asset:registered', payload: { asset: e.payload.asset } };
    }
    case 'asset:metadata-updated': {
      return { ...base, type: 'asset:metadata-updated', payload: {
        assetId: e.payload.assetId, metadata: e.payload.previousMetadata, previousMetadata: e.payload.metadata,
      }};
    }
    case 'asset:tagged': {
      return { ...base, type: 'asset:tagged', payload: {
        assetId: e.payload.assetId, tags: e.payload.previousTags, previousTags: e.payload.tags,
      }};
    }
    case 'provenance:root-set': {
      const { assetId, operation, edgeId } = e.payload;
      return { ...base, type: 'provenance:unlinked', payload: {
        edgeId, edge: { id: edgeId, fromAssetId: null, toAssetId: assetId, operation },
      }};
    }
    case 'provenance:linked': {
      const { edgeId, fromAssetId, toAssetId, operation } = e.payload;
      return { ...base, type: 'provenance:unlinked', payload: {
        edgeId, edge: { id: edgeId, fromAssetId, toAssetId, operation },
      }};
    }
    case 'provenance:unlinked': {
      const { edge } = e.payload;
      return { ...base, type: 'provenance:linked', payload: {
        edgeId: edge.id, fromAssetId: edge.fromAssetId, toAssetId: edge.toAssetId, operation: edge.operation,
      }};
    }
    case 'selection:set': {
      return { ...base, type: 'selection:set', payload: {
        selection: e.payload.previousSelection, previousSelection: e.payload.selection,
      }};
    }
    case 'selection:cleared': {
      return { ...base, type: 'selection:set', payload: {
        selection: e.payload.previousSelection, previousSelection: { type: 'none', ids: [] },
      }};
    }
    default:
      throw new Error(`Cannot invert unknown event type: ${(e as Event).type}`);
  }
}

export function createUndoManager(): UndoManager {
  const undoStack: UndoEntry[] = [];
  const redoStack: UndoEntry[] = [];

  return {
    record(commandId: string, events: readonly Event[]): void {
      undoStack.push({ commandId, events });
      redoStack.length = 0;
    },
    undo(): Event[] | null {
      const entry = undoStack.pop();
      if (!entry) return null;
      const compensating = entry.events.toReversed().map(invertEvent);
      redoStack.push(entry);
      return compensating;
    },
    redo(): Event[] | null {
      const entry = redoStack.pop();
      if (!entry) return null;
      // Preserve original timestamps for correct event ordering in audit views
      const reEvents = entry.events.map(e => ({ ...e, id: generateId() }));
      undoStack.push({ commandId: entry.commandId, events: reEvents });
      return reEvents;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
  };
}
