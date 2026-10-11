import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncidentRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import AuditScreen from '@/features/audit/screens/AuditScreen';
import IncidentsScreen from '@/features/incident/screens/IncidentsScreen';
import { IncidentRecordCard } from '@/features/incident/components/IncidentRecordCard';
import { getAuditLog } from '@/features/audit/api';
import {
  appendIncidentFollowUp,
  listIncidents,
  updateIncidentStatus,
} from '@/features/incident/api';
import { TEST_EVENT } from '../helpers/event';

const access = vi.hoisted(() => ({ allowed: true, session: true }));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useAllows: () => () => access.allowed,
  useRequireSession: () => (access.session ? { volunteerId: 'organiser' } : null),
  useCurrentSession: () => (access.session ? { volunteerId: 'organiser' } : null),
  useEventTime: () => ({ dateTime: (iso: string) => iso }),
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockApi = vi.mocked(api);
const root = `/events/${TEST_EVENT.id}`;
const at = '2027-01-07T01:00:00.000Z';
const entry = {
  id: 'audit-1',
  action: 'registration.void',
  entityType: 'Registration',
  entityId: 'reg-1',
  actorId: 'organiser',
  actorName: 'Event organiser',
  before: { voided: false },
  after: { voided: true, reason: 'Duplicate tap' },
  requestId: null,
  createdAt: at,
};
const incident: IncidentRecord = {
  id: 'incident-1',
  rehearsal: false,
  type: 'NEAR_MISS',
  severity: 'LOW',
  status: 'OPEN',
  stationId: null,
  stationName: null,
  locationNote: 'Hall entrance',
  description: 'Cable crossing was secured before it caused a trip.',
  reportedById: 'organiser',
  reportedByName: 'Event organiser',
  occurredAt: at,
  reportedAt: at,
  followUps: [
    {
      id: 'follow-up-1',
      rehearsal: false,
      note: 'Cones placed around the crossing',
      authorId: 'organiser',
      authorName: 'Event organiser',
      createdAt: at,
    },
  ],
};
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  mockApi.mockReset();
  access.allowed = true;
  access.session = true;
});
afterEach(cleanup);

describe('audit explorer', () => {
  it('shows immutable changes and pages older rows using all applied filters', async () => {
    mockApi.mockImplementation(async (path) => ({
      data: [String(path).includes('cursor=') ? { ...entry, id: 'audit-2' } : entry],
      meta: { count: 1, nextCursor: String(path).includes('cursor=') ? null : entry.id },
    }));
    show(<AuditScreen />);
    await screen.findByText('registration.void');
    fireEvent.click(screen.getByText('Before and after'));
    expect(screen.getByText(/Duplicate tap/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Action/), { target: { value: 'registration.void' } });
    fireEvent.change(screen.getByLabelText(/^Record type/), { target: { value: 'Registration' } });
    fireEvent.change(screen.getByLabelText(/^Record ID/), { target: { value: 'reg-1' } });
    fireEvent.change(screen.getByLabelText(/^Person ID/), { target: { value: 'organiser' } });
    fireEvent.change(screen.getByLabelText(/^From \(inclusive\)/), {
      target: { value: '2027-01-07T09:00' },
    });
    fireEvent.change(screen.getByLabelText(/^Until \(exclusive\)/), {
      target: { value: '2027-01-07T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply audit filters' }));
    await waitFor(() =>
      expect(
        mockApi.mock.calls.some(
          ([path]) =>
            String(path).includes('from=2027-01-07T01%3A00%3A00.000Z') &&
            String(path).includes('entityId=reg-1'),
        ),
      ).toBe(true),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Load older entries' }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(expect.stringContaining('cursor=audit-1'), {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('refuses an inverted event-clock range and reports failed reads', async () => {
    mockApi.mockRejectedValue(new Error('Audit service unavailable'));
    show(<AuditScreen />);
    await screen.findByText('Audit service unavailable');
    fireEvent.change(screen.getByLabelText(/^From \(inclusive\)/), {
      target: { value: '2027-01-07T10:00' },
    });
    fireEvent.change(screen.getByLabelText(/^Until \(exclusive\)/), {
      target: { value: '2027-01-07T09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply audit filters' }));
    await screen.findByText('The end must be after the start.');
    expect(mockApi).toHaveBeenCalledOnce();
  });

  it('handles empty pages and keeps a forbidden or signed-out explorer from fetching', async () => {
    mockApi.mockResolvedValue({ data: [], meta: { count: 0, nextCursor: null } });
    const view = show(<AuditScreen />);
    await screen.findByText('No matching audit entries');
    view.unmount();
    mockApi.mockClear();
    access.allowed = false;
    show(<AuditScreen />);
    expect(screen.getByText(/available to authorised organisers/)).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
    cleanup();
    access.allowed = true;
    access.session = false;
    const signedOut = show(<AuditScreen />);
    expect(signedOut.container.textContent).toBe('');
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('validates audit filters and response shape before rendering an untrusted result', async () => {
    mockApi.mockResolvedValue({ data: [entry], meta: { count: 1, nextCursor: null } });
    await getAuditLog(TEST_EVENT.id, { limit: 50 });
    mockApi.mockResolvedValue({
      data: [{ ...entry, createdAt: 'bad-time' }],
      meta: { count: 1, nextCursor: null },
    });
    await expect(getAuditLog(TEST_EVENT.id, { limit: 50 })).rejects.toThrow();
    await expect(getAuditLog(TEST_EVENT.id, { limit: 500 })).rejects.toThrow();
  });
});

describe('incident management', () => {
  it('lists and filters incidents, retains the original description and appends follow-ups', async () => {
    mockApi.mockImplementation(async (path, options) =>
      String(path).includes('/follow-ups')
        ? {
            incident: {
              ...incident,
              followUps: [
                ...incident.followUps,
                {
                  ...incident.followUps[0],
                  id: 'follow-up-2',
                  note: (options?.body as { note: string }).note,
                },
              ],
            },
          }
        : { data: [incident], meta: { count: 1, nextCursor: null } },
    );
    show(<IncidentsScreen />);
    await screen.findByText(incident.description);
    expect(screen.getByText(/Cones placed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /edit description/i })).toBeNull();
    fireEvent.change(screen.getByLabelText('Show incident status'), { target: { value: 'OPEN' } });
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(`${root}/incidents?limit=50&status=OPEN`, {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    fireEvent.change(await screen.findByLabelText('Follow-up note'), {
      target: { value: 'Floor team removed the cable crossing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Append follow-up' }));
    await screen.findByText('Follow-up recorded.');
    expect(mockApi).toHaveBeenCalledWith(`${root}/incidents/incident-1/follow-ups`, {
      method: 'POST',
      body: { note: 'Floor team removed the cable crossing' },
    });
    expect(screen.getByLabelText('Follow-up note')).toHaveProperty('value', '');
  });

  it('changes status with an optional note and shows a failed follow-up', async () => {
    mockApi.mockImplementation(async (path) => {
      if (String(path).includes('/follow-ups')) throw new Error('Follow-up could not save');
      return { incident: { ...incident, status: 'ACKNOWLEDGED' } };
    });
    show(<IncidentRecordCard incident={incident} />);
    expect(screen.getByRole('button', { name: 'Update incident status' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(screen.getByLabelText('Incident status'), {
      target: { value: 'ACKNOWLEDGED' },
    });
    fireEvent.change(screen.getByLabelText(/^Status note/), {
      target: { value: 'Floor lead is handling it' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update incident status' }));
    await screen.findByText('Incident status updated.');
    expect(mockApi).toHaveBeenCalledWith(`${root}/incidents/incident-1/status`, {
      method: 'POST',
      body: { status: 'ACKNOWLEDGED', note: 'Floor lead is handling it' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Append follow-up' }));
    expect(mockApi.mock.calls.some(([path]) => String(path).includes('/follow-ups'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Follow-up note'), {
      target: { value: 'Another leader checked the floor' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Append follow-up' }));
    await screen.findByText('Follow-up could not save');
  });

  it('pages the incident list and distinguishes empty, failure and forbidden states', async () => {
    mockApi.mockResolvedValue({ data: [incident], meta: { count: 1, nextCursor: incident.id } });
    const view = show(<IncidentsScreen />);
    await screen.findByText(incident.description);
    mockApi.mockResolvedValueOnce({
      data: [{ ...incident, id: 'incident-2' }],
      meta: { count: 1, nextCursor: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load older incidents' }));
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith(`${root}/incidents?limit=50&cursor=incident-1`, {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
    view.unmount();
    mockApi.mockResolvedValue({ data: [], meta: { count: 0, nextCursor: null } });
    show(<IncidentsScreen />);
    await screen.findByText('No matching incidents');
    cleanup();
    mockApi.mockRejectedValue(new Error('Incident service unavailable'));
    show(<IncidentsScreen />);
    await screen.findByText('Incident service unavailable');
    cleanup();
    access.allowed = false;
    mockApi.mockClear();
    show(<IncidentsScreen />);
    expect(mockApi).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Follow-up note')).toBeNull();
  });

  it('parses incident responses and validates write bodies before requests', async () => {
    mockApi.mockResolvedValueOnce({ data: [incident], meta: { count: 1, nextCursor: null } });
    expect((await listIncidents(TEST_EVENT.id, { limit: 2 })).data).toHaveLength(1);
    expect(mockApi).toHaveBeenLastCalledWith(`${root}/incidents?limit=2`, {
      signal: undefined,
      cache: 'no-store',
    });
    mockApi.mockResolvedValueOnce({ incident: { ...incident, status: 'INVALID' } });
    await expect(
      updateIncidentStatus(TEST_EVENT.id, 'a/b', { status: 'RESOLVED' }),
    ).rejects.toThrow();
    expect(mockApi).toHaveBeenLastCalledWith(`${root}/incidents/a%2Fb/status`, {
      method: 'POST',
      body: { status: 'RESOLVED' },
    });
    await expect(
      appendIncidentFollowUp(TEST_EVENT.id, incident.id, { note: '' }),
    ).rejects.toThrow();
  });
});
