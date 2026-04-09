import { describe, it, expect, vi } from 'vitest';
import { createEventStore } from '../src/event-store.js';
import type { Event } from '../src/types.js';

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: 'evt-1',
    commandId: 'cmd-1',
    actor: 'human',
    timestamp: 1000,
    type: 'asset:registered',
    payload: {},
    ...overrides,
  };
}

describe('EventStore', () => {
  it('starts empty', () => {
    const store = createEventStore();
    expect(store.getAll()).toEqual([]);
  });

  it('appends and retrieves events', () => {
    const store = createEventStore();
    const event = makeEvent();
    store.append(event);
    expect(store.getAll()).toEqual([event]);
  });

  it('getAll returns a copy (not the internal array)', () => {
    const store = createEventStore();
    store.append(makeEvent());
    const all = store.getAll();
    all.length = 0;
    expect(store.getAll()).toHaveLength(1);
  });

  it('getSince returns events after the given event ID', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1' }));
    store.append(makeEvent({ id: 'e2' }));
    store.append(makeEvent({ id: 'e3' }));
    expect(store.getSince('e1').map(e => e.id)).toEqual(['e2', 'e3']);
    expect(store.getSince('e3')).toEqual([]);
  });

  it('getSince returns empty for unknown event ID', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1' }));
    expect(store.getSince('unknown')).toEqual([]);
  });

  it('getByActor filters events by actor', () => {
    const store = createEventStore();
    store.append(makeEvent({ id: 'e1', actor: 'human' }));
    store.append(makeEvent({ id: 'e2', actor: 'agent' }));
    store.append(makeEvent({ id: 'e3', actor: 'human' }));
    expect(store.getByActor('human').map(e => e.id)).toEqual(['e1', 'e3']);
    expect(store.getByActor('agent').map(e => e.id)).toEqual(['e2']);
  });

  it('subscribe notifies on append', () => {
    const store = createEventStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const event = makeEvent();
    store.append(event);
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('unsubscribe stops notifications', () => {
    const store = createEventStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.append(makeEvent());
    expect(listener).not.toHaveBeenCalled();
  });
});
