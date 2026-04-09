import { useShallow } from 'zustand/react/shallow';
import { usePneumaCraftStore } from '../context.js';

export interface UndoState {
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export function useUndo(): UndoState {
  return usePneumaCraftStore(
    useShallow((s) => ({
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
    })),
  );
}
