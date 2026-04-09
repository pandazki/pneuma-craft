import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { AssetLibrary } from '../src/asset-library/index.js';
import { createTestWrapper } from './helpers.js';

afterEach(cleanup);

const Wrapper = createTestWrapper();

describe('AssetLibrary', () => {
  it('renders asset library container', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-library')).not.toBeNull();
  });

  it('renders filter bar', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-filter')).not.toBeNull();
  });

  it('renders grid', () => {
    const { container } = render(<Wrapper><AssetLibrary /></Wrapper>);
    expect(container.querySelector('.pc-asset-grid')).not.toBeNull();
  });

  it('renders compound sub-components', () => {
    const { container } = render(
      <Wrapper>
        <AssetLibrary>
          <AssetLibrary.Filter />
          <AssetLibrary.Grid />
        </AssetLibrary>
      </Wrapper>,
    );
    expect(container.querySelector('.pc-asset-filter')).not.toBeNull();
    expect(container.querySelector('.pc-asset-grid')).not.toBeNull();
  });
});
