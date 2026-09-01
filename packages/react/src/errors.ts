/**
 * Raised when work that was in flight against a store is abandoned because the
 * store was destroyed — provider unmount, a React StrictMode double-mount, or
 * a hot reload.
 *
 * This is a **cancellation, not a failure**. The store's fire-and-forget paths
 * (`play()`, `seek()`) swallow it silently; genuine failures still reach
 * `console.error`, so the error channel stays meaningful. Consumers awaiting a
 * store promise (`exportComposition`) can branch on it without matching
 * message strings.
 */
export class StoreDestroyedError extends Error {
  /**
   * Brand for {@link isStoreDestroyedError}. `instanceof` breaks across
   * duplicate copies of this package (two versions in one bundle, a dev-server
   * module graph reloaded in place); the brand survives all of those.
   */
  readonly storeDestroyed = true;

  constructor(message = 'Store destroyed') {
    super(message);
    this.name = 'StoreDestroyedError';
  }
}

/**
 * True when `error` marks work cancelled by store teardown rather than a real
 * failure. Prefer this over `instanceof StoreDestroyedError` — it holds even
 * when the error crossed a module boundary.
 */
export function isStoreDestroyedError(error: unknown): error is StoreDestroyedError {
  return typeof error === 'object'
    && error !== null
    && (error as { storeDestroyed?: unknown }).storeDestroyed === true;
}
