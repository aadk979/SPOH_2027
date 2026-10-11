import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api';
import { AssignmentBoard } from '@/features/staffing/components/AssignmentBoard';
import { AssignmentForm } from '@/features/staffing/components/AssignmentForm';
import { BriefingCard } from '@/features/staffing/components/BriefingCard';
import { BriefingScheduleForm } from '@/features/staffing/components/BriefingScheduleForm';
import { EscalationEditor } from '@/features/staffing/components/EscalationEditor';
import { SwapRequestForm } from '@/features/staffing/components/SwapRequestForm';
import { SwapReviewQueue } from '@/features/staffing/components/SwapReviewQueue';
import StaffingScreen from '@/features/staffing/screens/StaffingScreen';
import SwapsScreen from '@/features/staffing/screens/SwapsScreen';
import BriefingsScreen from '@/features/staffing/screens/BriefingsScreen';
import { assignmentCells, selectedStaffingDay } from '@/features/staffing/model/board';
import { listStaffingPeople } from '@/features/staffing/api';
import { MySwapHistory } from '@/features/staffing/components/MySwapHistory';
import {
  MY_STAFFING_ASSIGNMENT,
  STAFFING_ASSIGNMENT,
  STAFFING_BRIEFING,
  STAFFING_DAY,
  STAFFING_PERSON,
  STAFFING_STATION,
  STAFFING_SWAP,
} from '../helpers/staffing';

const state = vi.hoisted(() => ({ actions: [] as string[], session: true }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => (state.session ? { volunteerId: 'person' } : null),
  useCurrentSession: () => (state.session ? { volunteerId: 'person' } : null),
  useAllows: () => (action: string) => state.actions.includes(action),
  useMe: () => ({
    data: { event: { timezone: 'Asia/Singapore' }, upcomingAssignments: [MY_STAFFING_ASSIGNMENT] },
  }),
  useEventTime: () => ({ dateTime: (value: string) => value, shiftHours: () => '09:00–13:00' }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
const API = '/events/evt_test';
const envelope = (data: unknown[]) => ({ data, meta: { count: data.length, nextCursor: null } });
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  state.actions = [];
  state.session = true;
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method) return {};
    if (path.includes('/admin/event-days')) return envelope([STAFFING_DAY]);
    if (path.includes('/admin/volunteers')) return envelope([STAFFING_PERSON]);
    if (path.endsWith('/stations')) return envelope([STAFFING_STATION]);
    if (path.includes('/roster/station')) return envelope([]);
    if (path.includes('/swap-targets'))
      return envelope([{ id: 'target', displayName: 'Target Person' }]);
    if (path.includes('/swaps/pending')) return envelope([STAFFING_SWAP]);
    if (path.endsWith('/roster/swaps')) return envelope([]);
    if (path.includes('/briefing-slots')) return envelope([STAFFING_BRIEFING]);
    throw new Error(`Unhandled fixture ${path}`);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe('assignment board', () => {
  it('includes every shift×station, including cells with zero assigned, and ignores other shifts', () => {
    const day = {
      ...STAFFING_DAY,
      shifts: [STAFFING_DAY.shifts[0]!, { ...STAFFING_DAY.shifts[0]!, id: 'later' }],
    };
    const cells = assignmentCells({
      day,
      stations: [STAFFING_STATION, { ...STAFFING_STATION, id: 'other' }],
      assignments: [STAFFING_ASSIGNMENT],
    });
    expect(cells).toHaveLength(4);
    expect(cells.map((cell) => cell.assignments.length)).toEqual([1, 0, 0, 0]);
    expect(selectedStaffingDay([day], 'missing')).toBe(day);
    expect(selectedStaffingDay([], 'day')).toBeUndefined();
  });
  it('reads every roster page before offering people', async () => {
    mockedApi.mockResolvedValueOnce({ data: [STAFFING_PERSON], meta: { nextCursor: 'next' } });
    mockedApi.mockResolvedValueOnce(envelope([{ ...STAFFING_PERSON, id: 'second' }]));
    expect(await listStaffingPeople('event')).toHaveLength(2);
    expect(mockedApi.mock.calls[1]?.[0]).toContain('cursor=next');
  });
  it('shows a gap, creates an assignment, refreshes to zero gaps, then unassigns', async () => {
    let assigned = false;
    const fixture = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (path, options) => {
      if (path.endsWith('/admin/assignments')) {
        assigned = true;
        return {};
      }
      if (options?.method === 'DELETE') {
        assigned = false;
        return {};
      }
      if (path.includes('/roster/station')) return envelope(assigned ? [STAFFING_ASSIGNMENT] : []);
      return fixture(path, options);
    });
    show(<AssignmentBoard enabled />);
    await screen.findByText('1 unstaffed station shifts of 1.');
    fireEvent.change(screen.getByLabelText('Assign person'), { target: { value: 'person' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await screen.findByText('0 unstaffed station shifts of 1.');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/assignments`, {
      method: 'POST',
      body: {
        volunteerId: 'person',
        roleLabel: 'Volunteer',
        shiftId: 'shift',
        stationId: 'station',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unassign Sample Person' }));
    await screen.findByText('1 unstaffed station shifts of 1.');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/assignments/assignment`, {
      method: 'DELETE',
    });
  });
  it('validates a person before sending and shows rejected writes', async () => {
    mockedApi.mockRejectedValue(new Error('Assignment is locked'));
    show(<AssignmentForm stationId="station" shiftId="shift" people={[STAFFING_PERSON]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Assign person').getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(screen.getByLabelText('Assign person'), { target: { value: 'person' } });
    fireEvent.change(screen.getByLabelText('Assignment role'), { target: { value: 'Briefer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Assignment is locked')).toBeTruthy();
  });
  it('shows unavailable data and empty-day guidance', async () => {
    mockedApi.mockRejectedValueOnce(new Error('Read unavailable'));
    show(<AssignmentBoard enabled />);
    await screen.findByText('Read unavailable');
    cleanup();
    clients.splice(0).forEach((client) => client.clear());
    mockedApi.mockResolvedValue(envelope([]));
    show(<AssignmentBoard enabled />);
    await screen.findByText('Create event days and shifts before assigning people.');
  });
  it('hides private edits and reads until the server grants permissions', () => {
    show(<StaffingScreen />);
    expect(screen.queryByText('Assignment board')).toBeNull();
    expect(screen.queryByLabelText('Roster CSV')).toBeNull();
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it('uses the existing CSV preview/apply pipeline and invalidates a preview when edited', async () => {
    state.actions = ['Roster.Edit', 'People.Read'];
    const fixture = mockedApi.getMockImplementation()!;
    mockedApi.mockImplementation(async (path, options) =>
      path.endsWith('/roster/import')
        ? {
            committed: !!(options?.body as { commit: boolean }).commit,
            volunteersCreated: 0,
            volunteersUpdated: 1,
            assignmentsCreated: 1,
            assignmentsUpdated: 0,
            issues: [],
          }
        : fixture(path, options),
    );
    show(<StaffingScreen />);
    await screen.findByLabelText('Roster CSV');
    fireEvent.change(screen.getByLabelText('Roster CSV'), {
      target: {
        value:
          'displayName,email,stationCode,eventDate,shift\nSample Person,sample@example.test,ROOM,2027-01-08,MORNING',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
    await screen.findByRole('button', { name: 'Apply reviewed import' });
    expect(
      mockedApi.mock.calls.find(([path]) => path.endsWith('/roster/import'))?.[1]?.body,
    ).toMatchObject({ commit: false });
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed import' }));
    await screen.findByText(/Applied:/);
    expect(
      mockedApi.mock.calls
        .filter(([path]) => path.endsWith('/roster/import'))
        .map(([, options]) => (options?.body as { commit: boolean }).commit),
    ).toEqual([false, true]);
  });
});

describe('swaps', () => {
  it('allows only the requester to withdraw a pending swap with a stable retry receipt', async () => {
    let cancelled = false;
    mockedApi.mockImplementation(async (path, options) => {
      if (options?.method) {
        cancelled = true;
        return { data: { id: 'swap', status: 'CANCELLED' } };
      }
      return envelope([
        { ...STAFFING_SWAP, status: cancelled ? 'CANCELLED' : 'REQUESTED' },
        { ...STAFFING_SWAP, id: 'incoming', requesterId: 'other', reason: null },
      ]);
    });
    show(<MySwapHistory />);
    await screen.findByRole('button', { name: 'Withdraw request' });
    expect(screen.getAllByRole('button', { name: 'Withdraw request' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Withdraw request' })).toBeNull(),
    );
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/swaps/swap/withdraw`, {
      method: 'POST',
      body: { idempotencyKey: expect.any(String) },
    });
  });
  it('requires both selections, sends an optional reason and resets after success', async () => {
    show(
      <SwapRequestForm
        assignments={[MY_STAFFING_ASSIGNMENT]}
        targets={[{ id: 'target', displayName: 'Target Person' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Request swap' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Shift to give away'), {
      target: { value: 'assignment' },
    });
    fireEvent.change(screen.getByLabelText('Person taking the shift'), {
      target: { value: 'target' },
    });
    fireEvent.change(screen.getByLabelText(/Swap reason/), {
      target: { value: ' Exam timetable ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request swap' }));
    await screen.findByRole('status');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/swaps`, {
      method: 'POST',
      body: {
        assignmentId: 'assignment',
        targetVolunteerId: 'target',
        reason: 'Exam timetable',
        idempotencyKey: expect.any(String),
      },
    });
    expect((screen.getByLabelText('Shift to give away') as HTMLSelectElement).value).toBe('');
  });
  it('shows review only with a grant, while everyone can read their own history', async () => {
    show(<SwapsScreen />);
    await screen.findByText('No swap requests yet.');
    expect(screen.queryByRole('button', { name: 'Request swap' })).toBeNull();
    expect(mockedApi.mock.calls.some(([path]) => path.includes('/swaps/pending'))).toBe(false);
    expect(mockedApi.mock.calls.some(([path]) => path.includes('/swap-targets'))).toBe(false);
  });
  it('reads the chooser and exposes volunteer creation with a grant', async () => {
    state.actions = ['Swap.Request'];
    show(<SwapsScreen />);
    await screen.findByRole('button', { name: 'Request swap' });
    expect(screen.getByRole('option', { name: 'Target Person' })).toBeTruthy();
  });
  it('records a reviewed rejection and note without changing another request', async () => {
    show(<SwapReviewQueue />);
    await screen.findByRole('button', { name: 'Save decision' });
    fireEvent.change(screen.getByLabelText('Decision'), { target: { value: 'REJECTED' } });
    fireEvent.change(screen.getByLabelText(/Decision note/), {
      target: { value: 'Target already allocated.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save decision' }));
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/swaps/swap/decide`, {
        method: 'POST',
        body: {
          decision: 'REJECTED',
          note: 'Target already allocated.',
          idempotencyKey: expect.any(String),
        },
      }),
    );
  });
  it('reports an unavailable review queue', async () => {
    mockedApi.mockRejectedValue(new Error('Queue unavailable'));
    show(<SwapReviewQueue />);
    await screen.findByText('Queue unavailable');
  });
});

describe('briefing schedule and completion', () => {
  it('interprets the selected day on the event clock and sends a UUID receipt', async () => {
    show(
      <BriefingScheduleForm
        day={STAFFING_DAY}
        people={[STAFFING_PERSON]}
        timezone="Asia/Singapore"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schedule briefing' }));
    expect(mockedApi).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Briefing time (Asia/Singapore)'), {
      target: { value: '09:30' },
    });
    fireEvent.change(screen.getByLabelText('Briefer'), { target: { value: 'person' } });
    fireEvent.change(screen.getByLabelText('Wave size'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/Briefing notes/), {
      target: { value: 'Review route.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule briefing' }));
    await screen.findByRole('status');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/briefing-slots`, {
      method: 'POST',
      body: {
        eventDayId: 'day',
        startsAt: '2027-01-08T01:30:00.000Z',
        briefierId: 'person',
        waveSize: 25,
        notes: 'Review route.',
        idempotencyKey: expect.any(String),
      },
    });
  });
  it('retains the receipt on retry, and allows an unassigned wave', async () => {
    mockedApi.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({});
    show(<BriefingScheduleForm day={STAFFING_DAY} people={[]} timezone="Asia/Singapore" />);
    fireEvent.change(screen.getByLabelText('Briefing time (Asia/Singapore)'), {
      target: { value: '10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule briefing' }));
    await screen.findByText('Network unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Schedule briefing' }));
    await screen.findByRole('status');
    expect(mockedApi.mock.calls[0]?.[1]?.body).toEqual(mockedApi.mock.calls[1]?.[1]?.body);
    expect(mockedApi.mock.calls[0]?.[1]?.body).toMatchObject({ briefierId: null });
  });
  it('marks a briefing complete with notes, then renders completed slots read only', async () => {
    const view = show(<BriefingCard slot={STAFFING_BRIEFING} canComplete />);
    fireEvent.change(screen.getByLabelText(/Completion notes/), {
      target: { value: 'All four points covered.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mark briefing complete' }));
    await screen.findByRole('status');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/briefing-slots/briefing/complete`, {
      method: 'POST',
      body: { notes: 'All four points covered.', idempotencyKey: expect.any(String) },
    });
    view.rerender(
      <QueryClientProvider client={clients[0]!}>
        <BriefingCard
          slot={{ ...STAFFING_BRIEFING, completedAt: '2027-01-08T01:10:00.000Z' }}
          canComplete
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Mark briefing complete' })).toBeNull();
  });
  it('hides completion without a grant', () => {
    show(
      <BriefingCard
        slot={{ ...STAFFING_BRIEFING, briefierName: null, isMine: false, notes: null }}
        canComplete={false}
      />,
    );
    expect(screen.getByText('Unassigned')).toBeTruthy();
    expect(screen.queryByLabelText('Completion notes')).toBeNull();
  });
  it('loads future briefing days explicitly and offers scheduling only with both grants', async () => {
    state.actions = ['Roster.Edit', 'People.Read', 'Briefing.Complete'];
    show(<BriefingsScreen />);
    await screen.findByRole('button', { name: 'Schedule briefing' });
    await screen.findByText('Bring route guide');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/roster/briefing-slots?eventDayId=day`, {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });
  it('shows day-read errors while keeping scheduling unavailable', async () => {
    mockedApi.mockRejectedValue(new Error('Days unavailable'));
    show(<BriefingsScreen />);
    await screen.findByText('Days unavailable');
    expect(screen.queryByRole('button', { name: 'Schedule briefing' })).toBeNull();
  });
});

describe('escalation editing', () => {
  it('clears the reporting line as null and excludes self from choices', async () => {
    show(
      <EscalationEditor
        person={{ ...STAFFING_PERSON, reportsToId: 'target' }}
        people={[
          STAFFING_PERSON,
          { ...STAFFING_PERSON, id: 'target', displayName: 'Target Person' },
        ]}
      />,
    );
    expect(screen.queryByRole('option', { name: 'Sample Person' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Sample Person reports to'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reporting line' }));
    await screen.findByRole('status');
    expect(mockedApi).toHaveBeenCalledWith(`${API}/admin/volunteers/person`, {
      method: 'PATCH',
      body: { reportsToId: null, idempotencyKey: expect.any(String) },
    });
  });
  it('keeps all three screens private after sign-out', () => {
    state.session = false;
    const view = show(<StaffingScreen />);
    expect(view.container.textContent).toBe('');
    view.rerender(
      <QueryClientProvider client={clients[0]!}>
        <SwapsScreen />
      </QueryClientProvider>,
    );
    expect(view.container.textContent).toBe('');
    view.rerender(
      <QueryClientProvider client={clients[0]!}>
        <BriefingsScreen />
      </QueryClientProvider>,
    );
    expect(view.container.textContent).toBe('');
    expect(mockedApi).not.toHaveBeenCalled();
  });
});
