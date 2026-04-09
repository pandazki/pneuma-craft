import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExport } from '../../src/hooks/use-export.js';
import { createTestWrapper } from '../helpers.js';

describe('useExport', () => {
  it('returns initial export state', () => {
    const wrapper = createTestWrapper();
    const { result } = renderHook(() => useExport(), { wrapper });

    expect(result.current.exporting).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(typeof result.current.export).toBe('function');
    expect(typeof result.current.abort).toBe('function');
  });
});
