import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { Timeline } from '../src/timeline/index.js';
import { createTestWrapper } from './helpers.js';

afterEach(cleanup);

const Wrapper = createTestWrapper();

describe('Timeline', () => {
  it('renders timeline container', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline')).not.toBeNull();
  });

  it('renders toolbar', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-toolbar')).not.toBeNull();
  });

  it('renders track list', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-tracks')).not.toBeNull();
  });

  it('renders playhead', () => {
    const { container } = render(<Wrapper><Timeline /></Wrapper>);
    expect(container.querySelector('.pc-timeline-playhead')).not.toBeNull();
  });

  it('merges custom className', () => {
    const { container } = render(<Wrapper><Timeline className="custom" /></Wrapper>);
    const el = container.querySelector('.pc-timeline');
    expect(el?.classList.contains('custom')).toBe(true);
  });

  it('renders compound sub-components with Body wrapper', () => {
    const { container } = render(
      <Wrapper>
        <Timeline>
          <Timeline.Toolbar />
          <Timeline.Body>
            <Timeline.TrackList />
            <Timeline.Playhead />
          </Timeline.Body>
        </Timeline>
      </Wrapper>,
    );
    expect(container.querySelector('.pc-timeline-toolbar')).not.toBeNull();
    expect(container.querySelector('.pc-timeline-body')).not.toBeNull();
    expect(container.querySelector('.pc-timeline-tracks')).not.toBeNull();
    expect(container.querySelector('.pc-timeline-playhead')).not.toBeNull();
  });
});
