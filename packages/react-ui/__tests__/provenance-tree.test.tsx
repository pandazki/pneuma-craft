import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { ProvenanceTree } from '../src/provenance-tree/index.js';
import { createTestWrapper } from './helpers.js';

afterEach(cleanup);

const Wrapper = createTestWrapper();

describe('ProvenanceTree', () => {
  it('renders tree container', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="test" /></Wrapper>);
    expect(container.querySelector('.pc-provenance-tree')).not.toBeNull();
  });

  it('renders empty state when no tree', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="unknown" /></Wrapper>);
    expect(container.querySelector('.pc-provenance-tree')).not.toBeNull();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><ProvenanceTree assetId="test" className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-provenance-tree');
    expect(el?.classList.contains('custom')).toBe(true);
  });
});
