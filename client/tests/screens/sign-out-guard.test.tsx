import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutButton } from '@/shared/shell/SignOutButton';
import { cancel, flush, type OutboxEntry } from '@/shared/lib/outbox';
import { signOut } from '@/shared/lib/session';

/** ADR-007 §5 (F03-034): signing out shows what is still queued. */

const state = vi.hoisted(() => ({ replace: vi.fn(), entries: [] as OutboxEntry[] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/shared/lib/session', async (original) => ({
  ...(await original<typeof import('@/shared/lib/session')>()),
  signOut: vi.fn(() => Promise.resolve()),
  currentVolunteerId: () => 'v1',
}));
vi.mock('@/shared/lib/outbox', () => ({
  listEntries: vi.fn(() => Promise.resolve(state.entries)),
  flush: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(() => Promise.resolve(true)),
}));

const entry = (id: string, ownerId: string | null, status: OutboxEntry['status'] = 'pending') =>
  ({ id, ownerId, status, endpoint: '/registrations', body: {} }) as OutboxEntry;

beforeEach(() => {
  vi.mocked(signOut).mockClear();
  vi.mocked(flush).mockClear();
  vi.mocked(cancel).mockClear();
  state.replace.mockReset();
  state.entries = [];
});
afterEach(cleanup);

describe('sign-out with captures still queued', () => {
  it('signs out at once when nothing of theirs is waiting', async () => {
    state.entries = [entry('someone-else', 'v2')];
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(state.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('shows what is waiting and sends it before signing out', async () => {
    state.entries = [entry('a', 'v1'), entry('b', null), entry('c', 'v2')];
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('2 captures from this phone have not been sent yet.');
    expect(signOut).not.toHaveBeenCalled();

    state.entries = [entry('c', 'v2')];
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(flush).toHaveBeenCalledWith({ force: true });
  });

  it('keeps the prompt when sending did not empty the queue', async () => {
    state.entries = [entry('a', 'v1')];
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send now' }));
    await screen.findByText('1 capture from this phone has not been sent yet.');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('discards only after a confirmation, and only this volunteer’s captures', async () => {
    state.entries = [entry('a', 'v1'), entry('c', 'v2')];
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard them' }));
    expect(cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard 1 capture and sign out' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(vi.mocked(cancel).mock.calls).toEqual([['a']]);
  });
});
