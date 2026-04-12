import type {
  PneumaCraftCoreState,
  CoreCommand,
  Actor,
  Event,
  CommandEnvelope,
} from './types.js';
import { generateId } from './id.js';
import { createEventStore } from './event-store.js';
import { createInitialState, applyEvent } from './state.js';
import { handleCommand } from './command-handler.js';
import { createUndoManager } from './undo-manager.js';

export interface CraftCore {
  getState(): PneumaCraftCoreState;
  dispatch(actor: Actor, command: CoreCommand): Event[];
  dispatchEnvelope(envelope: CommandEnvelope<CoreCommand>): Event[];
  subscribe(listener: (event: Event) => void): () => void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  getEvents(): Event[];
}

export function createCore(): CraftCore {
  const eventStore = createEventStore();
  const undoManager = createUndoManager();
  let state = createInitialState();

  function appendEvents(events: Event[]): void {
    for (const event of events) {
      state = applyEvent(state, event);
      eventStore.append(event);
    }
  }

  function dispatchEnvelopeImpl(envelope: CommandEnvelope<CoreCommand>): Event[] {
    const events = handleCommand(state, envelope);
    undoManager.record(envelope.id, events);
    appendEvents(events);
    return events;
  }

  return {
    getState(): PneumaCraftCoreState {
      return state;
    },

    dispatch(actor: Actor, command: CoreCommand): Event[] {
      return dispatchEnvelopeImpl({
        id: generateId(),
        actor,
        timestamp: Date.now(),
        command,
      });
    },

    dispatchEnvelope(envelope: CommandEnvelope<CoreCommand>): Event[] {
      return dispatchEnvelopeImpl(envelope);
    },

    subscribe(listener: (event: Event) => void): () => void {
      return eventStore.subscribe(listener);
    },

    undo(): Event[] | null {
      const compensating = undoManager.undo();
      if (!compensating) return null;
      appendEvents(compensating);
      return compensating;
    },

    redo(): Event[] | null {
      const redoEvents = undoManager.redo();
      if (!redoEvents) return null;
      appendEvents(redoEvents);
      return redoEvents;
    },

    canUndo(): boolean {
      return undoManager.canUndo();
    },

    canRedo(): boolean {
      return undoManager.canRedo();
    },

    getEvents(): Event[] {
      return eventStore.getAll();
    },
  };
}
