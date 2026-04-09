import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PreviewRoot } from '../../src/headless/preview-root.js';
import { createTestWrapper } from '../helpers.js';

describe('PreviewRoot', () => {
  it('renders children with initial state', () => {
    const Wrapper = createTestWrapper();

    let capturedState: any;
    render(
      <Wrapper>
        <PreviewRoot>
          {(state) => {
            capturedState = state;
            return <div data-testid="preview">Preview</div>;
          }}
        </PreviewRoot>
      </Wrapper>,
    );

    expect(capturedState).toBeDefined();
    expect(capturedState.canvasRef).toBeDefined();
    expect(capturedState.isLoading).toBe(false);
    expect(capturedState.isReady).toBe(false);
  });
});
