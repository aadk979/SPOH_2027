import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VolunteerAdminRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { InvitePersonForm } from '@/features/provisioning/components/InvitePersonForm';
import { RosterImportForm } from '@/features/provisioning/components/RosterImportForm';
import { BulkPeoplePanel } from '@/features/volunteers/components/BulkPeoplePanel';
import { PersonSessionActions } from '@/features/volunteers/components/PersonSessionActions';
import { PersonLifecycle } from '@/features/people/components/PersonLifecycle';
import { PersonPrivacy } from '@/features/people/components/PersonPrivacy';
import { MfaEnrollment } from '@/features/session/components/MfaEnrollment';
import { DeviceCard } from '@/features/session/components/DeviceCard';
import { clearSession, setSession } from '@/shared/lib/session';
import { TEST_EVENT } from '../helpers/event';

const access = vi.hoisted(() => ({
  actions: ['People.Invite', 'People.AssignRole', 'People.Deactivate'],
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: access.replace }) }));
vi.mock('@/features/session', () => ({
  useCurrentSession: () => ({ volunteerId: 'self' }),
  useMe: () => ({ data: { volunteer: { id: 'self' } } }),
  useAllows: () => (action: string) => access.actions.includes(action),
}));
vi.mock('@/features/session/useEventTime', () => ({
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/shared/lib/session', () => ({
  clearSession: vi.fn(),
  setSession: vi.fn(),
  sessionFromResponse: (response: unknown) => response,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
const API = `/events/${TEST_EVENT.id}`;
const volunteer = {
  id: 'other',
  displayName: 'Sample Person',
  email: 'sample@example.test',
  role: 'VOLUNTEER',
  active: true,
  hasSignedIn: false,
} as VolunteerAdminRecord;
const counters = {
  volunteersCreated: 50,
  volunteersUpdated: 0,
  assignmentsCreated: 0,
  assignmentsUpdated: 0,
  issues: [],
};

function show(children: ReactNode): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  mockedApi.mockReset();
  access.replace.mockReset();
  access.actions = ['People.Invite', 'People.AssignRole', 'People.Deactivate'];
});

describe('personal data requests', () => {
  const person = { id: 'other', displayName: 'Sample Person', email: 'sample@example.test', deactivatedAt: '2026-10-10T00:00:00.000Z' };
  it('requires suspension and another platform admin before offering erasure', () => {
    access.actions = ['Platform.ManageAdmins'];
    show(<PersonPrivacy person={{ ...person, deactivatedAt: null }} />);
    expect(screen.queryByRole('button', { name: 'Review profile erasure' })).toBeNull(); cleanup();
    show(<PersonPrivacy person={{ ...person, id: 'self' }} />);
    expect(screen.queryByRole('button', { name: 'Review profile erasure' })).toBeNull();
  });
  it('validates and separately confirms a profile erasure with a retry receipt', async () => {
    access.actions = ['Platform.ManageAdmins']; mockedApi.mockResolvedValue({ identityChanged: false, sessionsRevoked: 1 });
    show(<PersonPrivacy person={person} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review profile erasure' }));
    expect(mockedApi).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Erasure reason'), { target: { value: 'Verified synthetic request' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review profile erasure' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm profile erasure' }));
    await screen.findByText(/Application profile erased/);
    expect(mockedApi).toHaveBeenCalledWith('/people/other/erase', { method: 'POST', body: {
      reason: 'Verified synthetic request', idempotencyKey: expect.any(String),
    } });
  });
  it('downloads the requested data without exposing a credential', async () => {
    access.actions = ['Platform.ManageAdmins'];
    mockedApi.mockResolvedValue({ data: { person: { id: 'other', displayName: 'Sample Person', email: 'sample@example.test', phone: null,
      createdAt: '2026-10-10T00:00:00.000Z', lastSeenAt: null, deactivatedAt: null, piiErasedAt: null,
      eventMemberships: [], refreshSessions: [], pushSubscriptions: [] }, activity: [] }, retained: ['Counts retained.'] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show(<PersonPrivacy person={person} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download personal data' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(mockedApi).toHaveBeenCalledWith('/people/other/data', { cache: 'no-store' });
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('People provisioning', () => {
  it('validates and invites one person with a retry receipt', async () => {
    mockedApi.mockResolvedValue({ identityCreated: true });
    show(<InvitePersonForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Sample Person ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'PERSON@example.test' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'IC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite person' }));
    await screen.findByText('Invited. Their sign-in instructions are sent by Cognito.');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/volunteers`, {
      method: 'POST',
      body: {
        displayName: 'Sample Person',
        email: 'person@example.test',
        role: 'IC',
        idempotencyKey: expect.any(String),
      },
    });
  });
  it('reports a reused identity without claiming an email was sent', async () => {
    mockedApi.mockResolvedValue({ identityCreated: false });
    show(<InvitePersonForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Invite person' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sample' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite person' }));
    await screen.findByText('Added to this event. They can use their existing sign-in.');
  });
  it('keeps the same idempotency key after a network failure', async () => {
    mockedApi
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValue({ identityCreated: true });
    show(<InvitePersonForm />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sample' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite person' }));
    await screen.findByText('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Invite person' }));
    await waitFor(() => expect(mockedApi).toHaveBeenCalledTimes(2));
    expect(mockedApi.mock.calls[1]?.[1]).toEqual(mockedApi.mock.calls[0]?.[1]);
  });
  it('finds three spreadsheet errors, previews 50 corrected people, then applies only the reviewed input', async () => {
    const valid =
      'displayName,email\n' +
      Array.from({ length: 50 }, (_, index) => `Sample ${index},person${index}@example.test`).join(
        '\n',
      );
    const invalid = valid
      .replace('person0@example.test', 'bad0')
      .replace('person1@example.test', 'bad1')
      .replace('person2@example.test', 'bad2');
    mockedApi.mockImplementation(async (_path, options) => ({
      ...counters,
      committed: (options?.body as { commit: boolean }).commit,
    }));
    show(<RosterImportForm />);
    fireEvent.change(screen.getByLabelText('Roster CSV'), { target: { value: invalid } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Line 4, email');
    fireEvent.change(screen.getByLabelText('Roster CSV'), { target: { value: valid } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByRole('button', { name: 'Apply reviewed import' });
    expect(mockedApi).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed import' }));
    await screen.findByText(/Applied: 50 people added/);
    const calls = mockedApi.mock.calls.map(
      (call) => call[1]?.body as { rows: unknown[]; commit: boolean; idempotencyKey: string },
    );
    expect(calls.map((body) => body.commit)).toEqual([false, true]);
    expect(calls[1]?.rows).toHaveLength(50);
    expect(calls[1]?.rows).toEqual(calls[0]?.rows);
    expect(calls[1]?.idempotencyKey).not.toBe(calls[0]?.idempotencyKey);
  });
  it('invalidates a preview on edits and refuses server-reported conflicts', async () => {
    mockedApi
      .mockResolvedValueOnce({ ...counters, committed: false })
      .mockResolvedValueOnce({
        ...counters,
        committed: false,
        issues: [{ rowNumber: 1, field: 'email', message: 'Restore their access first' }],
      });
    show(<RosterImportForm />);
    fireEvent.change(screen.getByLabelText('Roster CSV'), {
      target: { value: 'name,email\nSample,a@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByRole('button', { name: 'Apply reviewed import' });
    fireEvent.change(screen.getByLabelText('Roster CSV'), {
      target: { value: 'name,email\nChanged,a@example.test' },
    });
    expect(screen.queryByRole('button', { name: 'Apply reviewed import' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByText('Row 1, email: Restore their access first');
    expect(screen.queryByRole('button', { name: 'Apply reviewed import' })).toBeNull();
  });
});

describe('membership and device actions', () => {
  it('reviews selected bulk recipients and reports partial failures', async () => {
    mockedApi.mockResolvedValue({
      data: [{ id: 'other', ok: false, error: 'Role guardrail refused' }],
      meta: { count: 1 },
    });
    show(<BulkPeoplePanel rows={[volunteer, { ...volunteer, id: 'self', displayName: 'Self' }]} />);
    expect(screen.queryByLabelText(/Self —/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Sample Person — sample@example.test'));
    fireEvent.click(screen.getByRole('button', { name: 'Review bulk action' }));
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.getByText(/Apply resend to 1 people/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed action' }));
    await screen.findByText('Sample Person: Role guardrail refused');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/volunteers/bulk`, {
      method: 'POST',
      body: { ids: ['other'], action: 'resend', idempotencyKey: expect.any(String) },
    });
  });
  it('requires and reviews a bulk deactivation reason', async () => {
    show(<BulkPeoplePanel rows={[volunteer]} />);
    fireEvent.click(screen.getByLabelText('Sample Person — sample@example.test'));
    fireEvent.click(screen.getByLabelText('Deactivate in this event'));
    fireEvent.click(screen.getByRole('button', { name: 'Review bulk action' }));
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    expect(screen.getByLabelText('Reason').getAttribute('aria-invalid')).toBe('true');
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Left this event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Review bulk action' }));
    expect(screen.getByRole('button', { name: 'Apply reviewed action' })).toBeTruthy();
  });
  it('resends an invite and requires review before signing out a person', async () => {
    mockedApi.mockResolvedValueOnce({ sent: false }).mockResolvedValueOnce({ sessionsRevoked: 2 });
    show(<PersonSessionActions volunteer={volunteer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend sign-in invite' }));
    await screen.findByText(/They already have a sign-in/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    expect(mockedApi).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sign out everywhere' }));
    await screen.findByText('Signed out 2 sessions.');
  });
  it('revokes another device without clearing this session', async () => {
    mockedApi.mockResolvedValue(undefined);
    show(
      <DeviceCard
        device={{
          id: 'device',
          current: false,
          userAgent: null,
          issuedAt: '2026-10-10T00:00:00Z',
          lastUsedAt: null,
          expiresAt: '2026-11-10T00:00:00Z',
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sign out this device' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sign out' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/auth/sessions/device', {
        method: 'DELETE',
        credentials: 'include',
      }),
    );
    expect(clearSession).not.toHaveBeenCalled();
  });
  it('clears the local session and cached data after revoking this device', async () => {
    mockedApi.mockResolvedValue(undefined);
    const client = show(
      <DeviceCard
        device={{
          id: 'current',
          current: true,
          userAgent: 'Browser',
          issuedAt: '2026-10-10T00:00:00Z',
          lastUsedAt: null,
          expiresAt: '2026-11-10T00:00:00Z',
        }}
      />,
    );
    client.setQueryData(['private-record'], 'private');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm sign out' }));
    await waitFor(() => expect(clearSession).toHaveBeenCalled());
    expect(client.getQueryData(['private-record'])).toBeUndefined();
  });
  it('protects self-deactivation and confirms withdrawal across every event', async () => {
    mockedApi.mockResolvedValue({ identityChanged: true, sessionsRevoked: 3 });
    const rendered = show(
      <PersonLifecycle
        person={{
          id: 'self',
          displayName: 'Self',
          email: 'self@example.test',
          deactivatedAt: null,
        }}
      />,
    );
    expect(screen.getByText('You cannot deactivate your own account.')).toBeTruthy();
    cleanup();
    rendered.clear();
    show(
      <PersonLifecycle
        person={{
          id: 'other',
          displayName: 'Sample Person',
          email: 'a@example.test',
          deactivatedAt: null,
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Reason for deactivating'), {
      target: { value: 'Left organisation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate across all events' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deactivate everywhere' }));
    await screen.findByText('Person’s access updated.');
    expect(mockedApi).toHaveBeenCalledWith('/people/other/deactivate', {
      method: 'POST',
      body: { reason: 'Left organisation', idempotencyKey: expect.any(String) },
    });
  });
  it('enrols an authenticator and replaces the restricted session only after verification', async () => {
    mockedApi
      .mockResolvedValueOnce({ secretCode: 'TOTP-KEY' })
      .mockResolvedValueOnce({ accessToken: 'unrestricted' });
    show(<MfaEnrollment />);
    fireEvent.click(screen.getByRole('button', { name: 'Get setup key' }));
    await screen.findByText('TOTP-KEY');
    fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify authenticator' }));
    await waitFor(() => expect(setSession).toHaveBeenCalledWith({ accessToken: 'unrestricted' }));
    expect(access.replace).toHaveBeenCalledWith('/events');
    expect(mockedApi).toHaveBeenCalledWith('/auth/mfa/verify', {
      method: 'POST',
      body: { code: '123456' },
    });
  });
});
