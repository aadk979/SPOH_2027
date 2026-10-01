import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCapture } from '@/features/capture/useCapture';
import { cancel, flush, listEntries } from '@/shared/lib/outbox';
import * as eventContext from '@/shared/lib/eventContext';
import { api, ApiError } from '@/shared/lib/api';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));

beforeEach(async () => {
  for (const entry of await listEntries()) await cancel(entry.id);
  vi.mocked(api).mockReset();
});
afterEach(cleanup);

describe('practice captures on a shared outbox', () => {
  it.each(['/registrations', '/registrations/group', '/footfall/ticks'])(
    'retains the practice flag in %s after the event goes live',
    async (endpoint) => {
      const event = vi.spyOn(eventContext, 'useEvent');
      event.mockReturnValue({ ...TEST_EVENT, status: 'REHEARSAL' });
      const { result, rerender } = renderHook(() => useCapture());
      await act(() =>
        result.current.capture({ endpoint, body: { stationId: 'station-1' }, label: 'Practice' }),
      );
      const queued = (await listEntries())[0]!;
      expect(queued.body).toMatchObject({ rehearsal: true });
      event.mockReturnValue({ ...TEST_EVENT, status: 'LIVE' });
      rerender();
      vi.mocked(api).mockRejectedValue(
        new ApiError(409, { code: 'CONFLICT', message: 'The event changed mode', requestId: 'r' }),
      );
      await flush({ force: true });
      expect(api).toHaveBeenCalledWith(`/events/${TEST_EVENT.id}${endpoint}`, {
        method: 'POST',
        body: queued.body,
      });
      expect((await listEntries())[0]).toMatchObject({ status: 'failed', body: queued.body });
      await act(() =>
        result.current.capture({ endpoint, body: { stationId: 'station-1' }, label: 'Live' }),
      );
      expect((await listEntries()).find((entry) => entry.id !== queued.id)?.body).toMatchObject({
        rehearsal: false,
      });
    },
  );
});
