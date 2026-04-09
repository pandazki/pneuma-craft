import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { Button, IconButton } from '../src/atoms/index.js';

afterEach(cleanup);

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeDefined();
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onClick).toHaveBeenCalled();
  });

  it('applies variant class', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    expect(container.querySelector('.pc-button--primary')).toBeDefined();
  });

  it('merges custom className', () => {
    const { container } = render(<Button className="custom">Test</Button>);
    const btn = container.querySelector('.pc-button');
    expect(btn?.classList.contains('custom')).toBe(true);
  });
});

describe('IconButton', () => {
  it('renders with aria-label', () => {
    render(<IconButton icon="play" label="Play" />);
    expect(screen.getByLabelText('Play')).toBeDefined();
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<IconButton icon="play" label="Play" onClick={onClick} />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(onClick).toHaveBeenCalled();
  });
});
