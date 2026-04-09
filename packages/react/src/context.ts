import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { PneumaCraftStore, PneumaCraftStoreApi } from './store.js';

export const PneumaCraftContext = createContext<PneumaCraftStoreApi | null>(null);

export function usePneumaCraftStore<T>(selector: (state: PneumaCraftStore) => T): T {
  const store = useContext(PneumaCraftContext);
  if (!store) {
    throw new Error('usePneumaCraftStore must be used within <PneumaCraftProvider>');
  }
  return useStore(store, selector);
}
