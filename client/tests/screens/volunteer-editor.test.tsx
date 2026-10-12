import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VolunteerAdminRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { VolunteerEditor } from '@/features/volunteers/components/VolunteerEditor';
import { TEST_EVENT } from '../helpers/event';

/** The test event's API paths and screen addresses (tests/setup.ts). */
const API = `/events/${TEST_EVENT.id}`;
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
function show(active = true) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  const volunteer = {
    id: 'person-1',
    displayName: 'Test Volunteer',
    role: 'VOLUNTEER',
    phone: null,
    portfolio: null,
    active,
  } as VolunteerAdminRecord;
  render(
    <QueryClientProvider client={client}>
      <VolunteerEditor volunteer={volunteer} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mockedApi.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
describe('volunteer editor actions', () => {
  it('trims contact fields and reports revoked sessions after saving', async () => {
    mockedApi.mockResolvedValue({ sessionsRevoked: 2 });
    show();
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: ' 12345678 ' } });
    fireEvent.change(screen.getByLabelText(/^Portfolio/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/volunteers/person-1`, {
        method: 'PATCH',
        body: { role: 'VOLUNTEER', phone: '12345678', portfolio: null, idempotencyKey: expect.any(String) },
      }),
    );
    await screen.findByText(
      'Saved. 2 signed-in devices were signed out, so the new role takes effect immediately.',
    );
  });
  it('reviews event-only withdrawal, cancellation sends nothing, and the confirmed reason is frozen', async () => {
    mockedApi.mockResolvedValue({});
    show();
    const button = screen.getByRole('button', { name: 'Deactivate Test Volunteer' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  Left committee  ' } });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Withdraw Test Volunteer from this event?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockedApi).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Changed after review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm event withdrawal' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/volunteers/person-1/deactivate`, {
        method: 'POST',
        body: { reason: 'Left committee', disableIdentity: false, idempotencyKey: expect.any(String) },
      }),
    );
  });
  it('offers restoration only for inactive accounts and displays request failure', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    show(false);
    expect(screen.queryByRole('button', { name: 'Deactivate Test Volunteer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restore access' }));
    await screen.findByText('This action was not confirmed');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again. If this continues, contact an organiser.');
    expect(screen.queryByText('offline')).not.toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/volunteers/person-1/reactivate`, {
      method: 'POST',
      body: { idempotencyKey: expect.any(String) },
    });
  });
});
