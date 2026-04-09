import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { Preview } from '../src/preview/index.js';
import { createTestWrapper } from './helpers.js';

afterEach(cleanup);

const Wrapper = createTestWrapper();

describe('Preview', () => {
  it('renders preview container', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview')).not.toBeNull();
  });

  it('renders canvas element', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('renders playback controls', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-controls')).not.toBeNull();
  });

  it('renders play button', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('[aria-label="Play"]')).not.toBeNull();
  });

  it('renders time display', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-time')).not.toBeNull();
  });

  it('renders seekbar', () => {
    const { container } = render(<Wrapper><Preview /></Wrapper>);
    expect(container.querySelector('.pc-preview-seekbar')).not.toBeNull();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><Preview className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-preview');
    expect(el?.classList.contains('custom')).toBe(true);
  });
});
