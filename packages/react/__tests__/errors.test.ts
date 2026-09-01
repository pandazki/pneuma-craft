import { describe, it, expect } from 'vitest';
import { StoreDestroyedError, isStoreDestroyedError } from '../src/errors.js';

describe('StoreDestroyedError', () => {
  it('is an Error with a stable name and default message', () => {
    const err = new StoreDestroyedError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('StoreDestroyedError');
    expect(err.message).toBe('Store destroyed');
  });

  it('accepts a custom message', () => {
    expect(new StoreDestroyedError('gone during init').message).toBe('gone during init');
  });

  it('carries the storeDestroyed brand', () => {
    expect(new StoreDestroyedError().storeDestroyed).toBe(true);
  });
});

describe('isStoreDestroyedError', () => {
  it('identifies a StoreDestroyedError', () => {
    expect(isStoreDestroyedError(new StoreDestroyedError())).toBe(true);
  });

  it('identifies a branded error from another copy of the package (instanceof would fail)', () => {
    // Simulates the error crossing a module boundary: same brand, different class.
    const foreign = Object.assign(new Error('Store destroyed'), { storeDestroyed: true });
    expect(isStoreDestroyedError(foreign)).toBe(true);
  });

  it('rejects genuine failures and non-errors', () => {
    expect(isStoreDestroyedError(new Error('decode failed'))).toBe(false);
    expect(isStoreDestroyedError({ storeDestroyed: false })).toBe(false);
    expect(isStoreDestroyedError('Store destroyed')).toBe(false);
    expect(isStoreDestroyedError(null)).toBe(false);
    expect(isStoreDestroyedError(undefined)).toBe(false);
  });
});
