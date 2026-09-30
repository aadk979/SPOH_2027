import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { TEST_EVENT } from './helpers/event';

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

/**
 * Every screen works inside one event (ADR-001 §5), which the `/e/[event]`
 * layout resolves from the address. Tests render screens on their own, so
 * the page's event is the test event; the context itself stays real.
 */
vi.mock('@/shared/lib/eventContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/eventContext')>();
  return {
    ...actual,
    useEvent: () => TEST_EVENT,
    useEventId: () => TEST_EVENT.id,
    useOptionalEvent: () => TEST_EVENT,
    useEventHref: () => (path: string) => `/e/${TEST_EVENT.slug}${path === '/' ? '' : path}`,
  };
});
