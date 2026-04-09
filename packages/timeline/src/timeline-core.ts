import type {
  PneumaCraftCoreState,
  CoreCommand,
  Actor,
  Event,
  CommandEnvelope,
} from '@pneuma-craft/core';
import {
  generateId,
  createEventStore,
  createInitialState,
  applyEvent,
  handleCommand,
  createUndoManager,
  invertCoreEvent,
} from '@pneuma-craft/core';
import type { Composition, CompositionCommand } from './types.js';
import { createInitialCompositionState, applyCompositionEvent } from './state.js';
import type { CompositionState } from './state.js';
import { handleCompositionCommand } from './command-handler.js';
import { invertCompositionEvent } from './undo.js';

export interface TimelineCore {
  getCoreState(): PneumaCraftCoreState;
  getComposition(): Composition | null;
  dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[];
  subscribe(listener: (event: Event) => void): () => void;
  undo(): Event[] | null;
  redo(): Event[] | null;
  canUndo(): boolean;
  canRedo(): boolean;
  getEvents(): Event[];
}

function combinedInverter(event: Event): Event {
  if (event.type.startsWith('composition:')) {
    return invertCompositionEvent(event);
  }
  return invertCoreEvent(event);
}

function isCompositionCommand(
  command: CoreCommand | CompositionCommand,
): command is CompositionCommand {
  return command.type.startsWith('composition:');
}

export function createTimelineCore(): TimelineCore {
  const eventStore = createEventStore();
  const undoManager = createUndoManager(combinedInverter);
  let coreState = createInitialState();
  let compState: CompositionState = createInitialCompositionState();

  function appendEvents(events: Event[]): void {
    for (const event of events) {
      coreState = applyEvent(coreState, event);
      compState = applyCompositionEvent(compState, event);
      eventStore.append(event);
    }
  }

  return {
    getCoreState(): PneumaCraftCoreState {
      return coreState;
    },

    getComposition(): Composition | null {
      return compState.composition;
    },

    dispatch(actor: Actor, command: CoreCommand | CompositionCommand): Event[] {
      const envelope: CommandEnvelope = {
        id: generateId(),
        actor,
        timestamp: Date.now(),
        command: command as CoreCommand,
      };

      let events: Event[];
      if (isCompositionCommand(command)) {
        events = handleCompositionCommand(
          coreState,
          compState,
          envelope as CommandEnvelope<CompositionCommand>,
        );
      } else {
        events = handleCommand(coreState, envelope);
      }

      undoManager.record(envelope.id, events);
      appendEvents(events);
      return events;
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
