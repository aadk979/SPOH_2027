import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';

/**
 * Client test setup.
 *
 * `fake-indexeddb/auto` installs a real IndexedDB implementation on the global
 * object. The outbox is the one piece of client code where a mock would be
 * worse than useless — its whole job is surviving a browser restart, and a
 * stubbed store proves nothing about that.
 */
afterEach(() => {
  vi.restoreAllMocks();
});
