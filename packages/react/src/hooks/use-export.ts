import { useShallow } from 'zustand/react/shallow';
import type { ExportOptions } from '@pneuma-craft/video';
import { usePneumaCraftStore } from '../context.js';

export interface ExportHookState {
  readonly exporting: boolean;
  readonly progress: number;
  readonly export: (options: ExportOptions) => Promise<Blob>;
  readonly abort: () => void;
}

export function useExport(): ExportHookState {
  return usePneumaCraftStore(
    useShallow((s) => ({
      exporting: s.exporting,
      progress: s.exportProgress,
      export: s.exportComposition,
      abort: s.abortExport,
    })),
  );
}
