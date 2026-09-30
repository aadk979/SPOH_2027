import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import GroupRegistrationScreen from '@/features/registration/screens/GroupRegistrationScreen';
import { enqueue } from '@/shared/lib/outbox';
import { TEST_EVENT, TEST_CATEGORIES } from '../helpers/event';
vi.mock('@/features/registration/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/registration/queries')>()),
  useCaptureCategories: () => ({ data: TEST_CATEGORIES }),
}));

/** The test event's API paths and screen addresses (tests/setup.ts). */
const APP = `/e/${TEST_EVENT.slug}`;
const state = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useMe: () => ({ data: { currentAssignment: { station: { id: 'booth' } } } }),
}));
vi.mock('@/shared/lib/outbox', () => ({ enqueue: vi.fn() }));
const mockedEnqueue = vi.mocked(enqueue);
beforeEach(() => {
  mockedEnqueue.mockReset();
  state.replace.mockReset();
});
afterEach(cleanup);
describe('group registration submission', () => {
  it('queues the composition and optional card before navigating', async () => {
    mockedEnqueue.mockImplementation(async (input) => ({
      id: input.idempotencyKey,
      endpoint: `/events/${input.eventId}${input.path}`,
      eventId: input.eventId,
      body: input.body,
      method: 'POST',
      clientRecordedAt: '2026-09-28T02:00:00Z',
      attempts: 0,
      lastAttemptAt: null,
      status: 'pending',
      lastError: null,
    }));
    render(<GroupRegistrationScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Add one Sec 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add one Parent / Guardian' }));
    fireEvent.change(screen.getByLabelText(/Mission Card code/), { target: { value: 'abc234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register 2 people' }));
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith(`${APP}/capture/registration`));
    expect(mockedEnqueue).toHaveBeenCalledOnce();
    const entry = mockedEnqueue.mock.calls[0]![0];
    expect(entry.path).toBe('/registrations/group');
    expect(entry.eventId).toBe(TEST_EVENT.id);
    expect(entry.body).toEqual({
      stationId: 'booth',
      members: [
        { category: 'SEC_4', count: 1 },
        { category: 'PARENT_GUARDIAN', count: 1 },
      ],
      missionCardShortCode: 'ABC234',
      idempotencyKey: entry.idempotencyKey,
      clientRecordedAt: expect.any(String),
    });
  });
  it('keeps the composition available for retry when local persistence fails', async () => {
    mockedEnqueue.mockRejectedValue(new Error('storage unavailable'));
    render(<GroupRegistrationScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Add one Sec 4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Register 1 person' }));
    await screen.findByText(
      'This group was not recorded. Try again, and tell your IC if it keeps happening.',
    );
    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Register 1 person' }).hasAttribute('disabled')).toBe(
      false,
    );
    expect(mockedEnqueue.mock.calls[0]![0].body).not.toHaveProperty('missionCardShortCode');
  });
});
