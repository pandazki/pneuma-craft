import type { Event, Actor } from './types.js';

export interface EventStore {
  append(event: Event): void;
  getAll(): Event[];
  getSince(eventId: string): Event[];
  getByActor(actor: Actor): Event[];
  subscribe(listener: (event: Event) => void): () => void;
}

export function createEventStore(): EventStore {
  const events: Event[] = [];
  const listeners = new Set<(event: Event) => void>();

  return {
    append(event: Event): void {
      events.push(event);
      for (const listener of listeners) {
        listener(event);
      }
    },

    getAll(): Event[] {
      return events.slice();
    },

    getSince(eventId: string): Event[] {
      const index = events.findIndex(e => e.id === eventId);
      if (index === -1) return [];
      return events.slice(index + 1);
    },

    getByActor(actor: Actor): Event[] {
      return events.filter(e => e.actor === actor);
    },

    subscribe(listener: (event: Event) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
