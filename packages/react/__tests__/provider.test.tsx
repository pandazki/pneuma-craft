import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PneumaCraftProvider } from '../src/provider.js';
import { usePneumaCraftStore } from '../src/context.js';
import { createMockAssetResolver, createTestWrapper } from './helpers.js';

describe('PneumaCraftProvider', () => {
  it('renders children', () => {
    const resolver = createMockAssetResolver();
    render(
      <PneumaCraftProvider assetResolver={resolver}>
        <div data-testid="child">Hello</div>
      </PneumaCraftProvider>,
    );
    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.getByTestId('child').textContent).toBe('Hello');
  });

  it('provides store to children via context', () => {
    function TestChild() {
      const registrySize = usePneumaCraftStore(
        (s) => s.coreState.registry.size,
      );
      return <div data-testid="size">{registrySize}</div>;
    }

    const Wrapper = createTestWrapper();
    render(
      <Wrapper>
        <TestChild />
      </Wrapper>,
    );
    expect(screen.getByTestId('size').textContent).toBe('0');
  });

  it('throws when usePneumaCraftStore is used outside provider', () => {
    function BadChild() {
      usePneumaCraftStore((s) => s.coreState);
      return null;
    }

    expect(() => render(<BadChild />)).toThrow(
      'usePneumaCraftStore must be used within <PneumaCraftProvider>',
    );
  });
});
