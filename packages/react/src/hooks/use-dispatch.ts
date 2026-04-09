import { useCallback } from 'react';
import type { Actor, CoreCommand, Event } from '@pneuma-craft/core';
import type { CompositionCommand } from '@pneuma-craft/timeline';
import { usePneumaCraftStore } from '../context.js';

export function useDispatch(): (actor: Actor, command: CoreCommand | CompositionCommand) => Event[] {
  const dispatch = usePneumaCraftStore((s) => s.dispatch);
  return useCallback(
    (actor: Actor, command: CoreCommand | CompositionCommand) => dispatch(actor, command),
    [dispatch],
  );
}
