import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineRoot } from '../../src/headless/timeline-root.js';
import { createTestWrapper } from '../helpers.js';

describe('TimelineRoot', () => {
  it('renders children with initial state', () => {
    const Wrapper = createTestWrapper();

    let capturedState: any;
    render(
      <Wrapper>
        <TimelineRoot>
          {(state) => {
            capturedState = state;
            return <div>Timeline</div>;
          }}
        </TimelineRoot>
      </Wrapper>,
    );

    expect(capturedState.tracks).toEqual([]);
    expect(capturedState.duration).toBe(0);
    expect(capturedState.playheadPosition).toBe(0);
  });

  it('converts time to pixels with default pixelsPerSecond', () => {
    const Wrapper = createTestWrapper();

    let capturedState: any;
    render(
      <Wrapper>
        <TimelineRoot>
          {(state) => {
            capturedState = state;
            return null;
          }}
        </TimelineRoot>
      </Wrapper>,
    );

    expect(capturedState.timeToPixels(1)).toBe(100);
    expect(capturedState.timeToPixels(2.5)).toBe(250);
  });

  it('converts pixels to time with default pixelsPerSecond', () => {
    const Wrapper = createTestWrapper();

    let capturedState: any;
    render(
      <Wrapper>
        <TimelineRoot>
          {(state) => {
            capturedState = state;
            return null;
          }}
        </TimelineRoot>
      </Wrapper>,
    );

    expect(capturedState.pixelsToTime(100)).toBe(1);
    expect(capturedState.pixelsToTime(250)).toBe(2.5);
  });

  it('uses custom pixelsPerSecond', () => {
    const Wrapper = createTestWrapper();

    let capturedState: any;
    render(
      <Wrapper>
        <TimelineRoot pixelsPerSecond={50}>
          {(state) => {
            capturedState = state;
            return null;
          }}
        </TimelineRoot>
      </Wrapper>,
    );

    expect(capturedState.timeToPixels(1)).toBe(50);
    expect(capturedState.pixelsToTime(50)).toBe(1);
  });
});
