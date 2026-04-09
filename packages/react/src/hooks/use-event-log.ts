import { useMemo } from 'react';
import type { Actor, Event } from '@pneuma-craft/core';
import { usePneumaCraftStore } from '../context.js';

export interface EventLogFilter {
  readonly actor?: Actor;
}

export function useEventLog(filter?: EventLogFilter): Event[] {
  const events = usePneumaCraftStore((s) => s.events);
  return useMemo(() => {
    if (!filter?.actor) return [...events];
    return events.filter((e) => e.actor === filter.actor);
  }, [events, filter?.actor]);
}
