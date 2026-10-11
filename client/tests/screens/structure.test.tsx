import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api';
import { getStructure, saveStructure, saveStation, saveDay } from '@/features/structure/api';
import { StationEditor } from '@/features/structure/components/StationEditor';
import { StationTypeEditor } from '@/features/structure/components/StationTypeEditor';
import { StationTagEditor } from '@/features/structure/components/StationTagEditor';
import { CategoryEditor } from '@/features/structure/components/CategoryEditor';
import { DayEditor } from '@/features/structure/components/DayEditor';
import { TemplateEditor } from '@/features/structure/components/TemplateEditor';
import { ExceptionEditor } from '@/features/structure/components/ExceptionEditor';
import { ExceptionsGrid } from '@/features/structure/components/ExceptionsGrid';
import { RemoveDay } from '@/features/structure/components/RemoveDay';
import { WriteFeedback } from '@/features/structure/components/WriteFeedback';
import StationsScreen from '@/features/structure/screens/StationsScreen';
import DaysScreen from '@/features/structure/screens/DaysScreen';
import CategoriesScreen from '@/features/structure/screens/CategoriesScreen';
import { structureKeys } from '@/features/structure/queries';
import { eventDayKeys } from '@/features/eventDays';
import { ApiError } from '@/shared/lib/apiErrors';
import {
  categoryValues,
  dayValues,
  stationValues,
  tagValues,
  templateValues,
  typeValues,
} from '@/features/structure/model/editorDefaults';
import {
  STRUCTURE,
  STRUCTURE_DAY,
  STRUCTURE_STATION,
  STRUCTURE_TAG,
  STRUCTURE_TEMPLATE,
  STRUCTURE_TYPE,
} from '../helpers/structure';
const state = vi.hoisted(() => ({
  session: true,
  personId: 'person',
  eventId: 'evt_test',
  actions: ['Structure.Read', 'Structure.Edit', 'Structure.Change'],
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => (state.session ? { volunteerId: state.personId } : null),
  useCurrentSession: () => (state.session ? { volunteerId: state.personId } : null),
  useAllows: () => (action: string) => state.actions.includes(action),
}));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => state.eventId,
}));
vi.mock('@/features/taxonomy', () => ({
  CategorySchedulesPanel: ({ enabled }: { enabled: boolean }) =>
    enabled ? <p>Scheduled category changes</p> : null,
}));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/shared/lib/api', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const wrap = (child: ReactNode) => (
    <QueryClientProvider client={client}>{child}</QueryClientProvider>
  );
  return { client, wrap, ...render(wrap(node)) };
}
const edit = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
const key = '00000000-0000-4000-8000-000000000001';
const envelope = (data: unknown[]) => ({ data, meta: { count: data.length, nextCursor: null } });
beforeEach(() => {
  state.session = true;
  state.personId = 'person';
  state.eventId = 'evt_test';
  state.actions = ['Structure.Read', 'Structure.Edit', 'Structure.Change'];
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (path, options) => {
    if (options?.method) {
      if (path.includes('/admin/stations')) return { station: STRUCTURE_STATION };
      if (path.includes('/admin/event-days')) return { eventDay: STRUCTURE_DAY };
      return { data: {} };
    }
    if (path.endsWith('/structure')) return { data: STRUCTURE };
    if (path.endsWith('/admin/stations')) return envelope([STRUCTURE_STATION]);
    if (path.endsWith('/admin/event-days')) return envelope([STRUCTURE_DAY]);
    throw new Error(`Unexpected structure fixture ${path}`);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
describe('metadata forms', () => {
  it('validates a station, selects real type/tag codes, normalizes location and creates with a receipt', async () => {
    mount(<StationEditor structure={STRUCTURE} />);
    submit('Create station');
    expect(mockedApi).not.toHaveBeenCalled();
    edit('Station code', 'demo_room');
    edit('Station name', 'Demo room');
    edit('Station type', 'ROOM');
    fireEvent.click(screen.getByLabelText('Group'));
    edit('Floor or location', '  Level A  ');
    edit('Display order', '3');
    submit('Create station');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/stations',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            code: 'DEMO_ROOM',
            name: 'Demo room',
            typeCode: 'ROOM',
            tagCodes: ['GROUP'],
            floor: 'Level A',
            sortOrder: 3,
            idempotencyKey: expect.any(String),
          }),
        }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
    expect(screen.getByLabelText('Station name')).toHaveProperty('value', '');
  });
  it('keeps station codes immutable, clears location explicitly and preserves a failed retry receipt', async () => {
    mockedApi
      .mockRejectedValueOnce(new Error('Network failed'))
      .mockResolvedValueOnce({ station: STRUCTURE_STATION });
    mount(<StationEditor record={{ ...STRUCTURE_STATION, floor: 'Old' }} structure={STRUCTURE} />);
    expect(screen.getByLabelText('Station code')).toBeDisabled();
    edit('Floor or location', '');
    fireEvent.click(screen.getByLabelText('Group'));
    fireEvent.click(screen.getByLabelText('Active station'));
    submit('Save station');
    await screen.findByText('Network failed');
    submit('Save station');
    await screen.findByText('Saved.');
    const first = mockedApi.mock.calls[0]![1]!.body as { idempotencyKey: string };
    const again = mockedApi.mock.calls[1]![1]!.body as { idempotencyKey: string };
    expect(again.idempotencyKey).toBe(first.idempotencyKey);
    expect(first).toMatchObject({ floor: null, tagCodes: [], active: false });
    expect(first).not.toHaveProperty('code');
  });
  it('creates a type with explicit capability flags and normalized code', async () => {
    mount(<StationTypeEditor />);
    edit('Type code', 'count_room');
    edit('Type label', 'Count room');
    fireEvent.click(screen.getByLabelText('Counts room entries'));
    fireEvent.click(screen.getByLabelText('Stamps mission cards'));
    submit('Create type');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/types',
        expect.objectContaining({
          body: expect.objectContaining({
            code: 'COUNT_ROOM',
            countsEntry: true,
            issuesStamp: true,
            registersVisitors: false,
            redeemsGifts: false,
          }),
        }),
      ),
    );
  });
  it('allows relabel/deactivation while freezing capabilities after go-live', async () => {
    state.actions = ['Structure.Read', 'Structure.Edit'];
    mount(<StationTypeEditor record={STRUCTURE_TYPE} />);
    expect(screen.getByLabelText('Counts room entries')).toBeDisabled();
    edit('Type label', 'Renamed');
    fireEvent.click(screen.getByLabelText('Active type'));
    submit('Save type');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/types/type',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ label: 'Renamed', active: false, countsEntry: true }),
        }),
      ),
    );
  });
  it('creates tags and clears their description explicitly when editing', async () => {
    const mounted = mount(<StationTagEditor />);
    edit('Tag code', 'cluster');
    edit('Tag label', 'Cluster');
    edit('Tag description', 'Notes');
    submit('Create tag');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/tags',
        expect.objectContaining({
          body: expect.objectContaining({ code: 'CLUSTER', description: 'Notes' }),
        }),
      ),
    );
    mounted.unmount();
    mount(<StationTagEditor record={STRUCTURE_TAG} />);
    expect(screen.getByLabelText('Tag code')).toBeDisabled();
    edit('Tag description', '');
    fireEvent.click(screen.getByLabelText('Active tag'));
    submit('Save tag');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/tags/tag',
        expect.objectContaining({
          body: expect.objectContaining({ description: null, active: false }),
        }),
      ),
    );
  });
  it('validates visitor category labels and preserves a stable code during order/activity edits', async () => {
    const mounted = mount(<CategoryEditor />);
    edit('Category code', 'GUEST');
    submit('Create category');
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Category label')).toHaveAttribute('aria-invalid', 'true');
    edit('Category label', 'Guests');
    edit('Display order', '5');
    submit('Create category');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/categories',
        expect.objectContaining({
          body: expect.objectContaining({ sortOrder: 5, label: 'Guests' }),
        }),
      ),
    );
    mounted.unmount();
    mount(<CategoryEditor record={STRUCTURE.categories[0]} />);
    expect(screen.getByLabelText('Category code')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Active category'));
    submit('Save category');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/categories/category',
        expect.objectContaining({ body: expect.objectContaining({ active: false }) }),
      ),
    );
  });
  it('creates days using local dates and retains existing day flags on relabel', async () => {
    const mounted = mount(<DayEditor />);
    edit('Event date', '2027-01-09');
    edit('Day label', 'Extra day');
    fireEvent.click(screen.getByLabelText('Tour day'));
    submit('Create day');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/event-days',
        expect.objectContaining({
          body: expect.objectContaining({ date: '2027-01-09', isPublicDay: true, isTourDay: true }),
        }),
      ),
    );
    mounted.unmount();
    mount(<DayEditor record={STRUCTURE_DAY} />);
    expect(screen.getByLabelText('Event date')).toBeDisabled();
    edit('Day label', 'Renamed');
    submit('Save day');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/event-days/day',
        expect.objectContaining({
          body: expect.objectContaining({ label: 'Renamed', isPublicDay: false, isTourDay: true }),
        }),
      ),
    );
  });
});
describe('templates, exceptions and unused days', () => {
  it('rejects backwards same-day hours and permits an explicit overnight shift', async () => {
    mount(<TemplateEditor />);
    edit('Template code', 'NIGHT');
    edit('Shift label', 'Night');
    edit('Start time', '22:00');
    edit('End time', '02:00');
    submit('Create template');
    expect(mockedApi).not.toHaveBeenCalled();
    expect(screen.getByLabelText('End time')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByLabelText('Ends the next day'));
    submit('Create template');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/templates',
        expect.objectContaining({
          body: expect.objectContaining({ code: 'NIGHT', endsNextDay: true }),
        }),
      ),
    );
  });
  it('edits a template and freezes hours/reactivation when Structure.Change is unavailable', async () => {
    state.actions = ['Structure.Read', 'Structure.Edit'];
    mount(<TemplateEditor record={{ ...STRUCTURE_TEMPLATE, active: false }} />);
    expect(screen.getByLabelText('Start time')).toBeDisabled();
    expect(screen.getByLabelText('End time')).toBeDisabled();
    expect(screen.getByLabelText('Active template')).toBeDisabled();
    edit('Shift label', 'Renamed');
    submit('Save template');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/templates/template',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ label: 'Renamed', active: false, startLocal: '09:00' }),
        }),
      ),
    );
  });
  it('writes only the selected shift exception and can follow its current template again', async () => {
    mount(<ExceptionEditor shift={{ ...STRUCTURE.shifts[0]!, overridden: true }} editable />);
    edit('Exception start time', '10:00');
    edit('Exception end time', '14:00');
    fireEvent.click(screen.getByLabelText('Exception ends the next day'));
    submit('Save exception');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        '/events/evt_test/admin/structure/shifts/shift',
        expect.objectContaining({
          body: expect.objectContaining({
            operation: 'override',
            startLocal: '10:00',
            endLocal: '14:00',
            endsNextDay: true,
          }),
        }),
      ),
    );
    submit('Follow template again');
    await waitFor(() =>
      expect(mockedApi).toHaveBeenLastCalledWith(
        '/events/evt_test/admin/structure/shifts/shift',
        expect.objectContaining({
          body: { operation: 'restore', idempotencyKey: expect.any(String) },
        }),
      ),
    );
  });
  it('renders the days×shifts grid with existing exceptions, empty/missing cells and the event timezone', () => {
    const mounted = mount(
      <ExceptionsGrid
        structure={{
          ...STRUCTURE,
          shifts: [{ ...STRUCTURE.shifts[0]!, overridden: true, endsNextDay: true }],
        }}
        days={[STRUCTURE_DAY]}
        editable
      />,
    );
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText(/All hours use Asia\/Singapore/)).toBeTruthy();
    expect(screen.getByText('Exception')).toBeTruthy();
    mounted.unmount();
    const missing = mount(
      <ExceptionsGrid
        structure={{ ...STRUCTURE, shifts: [] }}
        days={[STRUCTURE_DAY]}
        editable={false}
      />,
    );
    expect(screen.getByText('No shift configured')).toBeTruthy();
    missing.unmount();
    mount(<ExceptionsGrid structure={STRUCTURE} days={[]} editable={false} />);
    expect(
      screen.getByText('Add days and active templates to see the exceptions grid'),
    ).toBeTruthy();
  });
  it('requires explicit selection before removing an unused day and surfaces refusal', async () => {
    mockedApi.mockRejectedValueOnce(new Error('This day has assignments'));
    mount(<RemoveDay day={STRUCTURE_DAY} />);
    expect(screen.getByRole('button', { name: 'Remove unused day' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Remove Event day (2027-01-07) and its empty shifts'));
    submit('Remove unused day');
    await screen.findByText('This day has assignments');
    expect(mockedApi).toHaveBeenCalledWith(
      '/events/evt_test/admin/structure/days/day',
      expect.objectContaining({ method: 'DELETE', body: { idempotencyKey: expect.any(String) } }),
    );
  });
});
describe('structure screens and API contracts', () => {
  it.each([StationsScreen, DaysScreen, CategoriesScreen])(
    'opens the complete setup workspace through real feature queries',
    async (Screen) => {
      mount(<Screen />);
      await waitFor(() => expect(screen.queryByLabelText('Loading event structure')).toBeNull());
      expect(mockedApi).toHaveBeenCalledWith('/events/evt_test/admin/structure', {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
      expect(screen.getAllByRole('heading').length).toBeGreaterThan(0);
    },
  );
  it('blocks data reads for a denied role and renders nothing without a session', () => {
    state.actions = [];
    const mounted = mount(<StationsScreen />);
    expect(screen.getByText('Your role cannot read event structure.')).toBeTruthy();
    expect(mockedApi).not.toHaveBeenCalled();
    mounted.unmount();
    state.session = false;
    const loggedOut = mount(<DaysScreen />);
    expect(loggedOut.container.textContent).toBe('');
  });
  it('offers retry after a structure load fails and can show read-only empty collections', async () => {
    mockedApi.mockRejectedValueOnce(new Error('Load failed'));
    mount(<CategoriesScreen />);
    await screen.findByText('Load failed');
    submit('Reload structure');
    await screen.findByText('Guests');
    cleanup();
    mockedApi.mockResolvedValue({ data: { ...STRUCTURE, categories: [] } });
    mount(<CategoriesScreen />);
    await screen.findByText('No visitor categories yet');
  });
  it('refuses another event’s structure and invalid write bodies before sending', async () => {
    mockedApi.mockResolvedValueOnce({ data: { ...STRUCTURE, eventId: 'other-event' } });
    await expect(getStructure('evt_test')).rejects.toThrow('another event');
    mockedApi.mockClear();
    expect(() =>
      saveStructure('evt_test', {
        kind: 'shift',
        body: { operation: 'restore', idempotencyKey: key },
      }),
    ).toThrow('Choose a shift');
    expect(mockedApi).not.toHaveBeenCalled();
  });
  it('serializes immutable IDs safely and validates station/day responses', async () => {
    await saveStructure('evt_test', {
      kind: 'tag',
      id: 'tag/a',
      body: { label: 'Renamed', idempotencyKey: key },
    });
    expect(mockedApi).toHaveBeenLastCalledWith(
      '/events/evt_test/admin/structure/tags/tag%2Fa',
      expect.objectContaining({ method: 'PATCH' }),
    );
    await saveStation('evt_test', {
      id: 'station/a',
      body: { name: 'Renamed', idempotencyKey: key },
    });
    expect(mockedApi).toHaveBeenLastCalledWith(
      '/events/evt_test/admin/stations/station%2Fa',
      expect.objectContaining({ method: 'PATCH' }),
    );
    await saveDay('evt_test', { id: 'day/a', body: { label: 'Renamed', idempotencyKey: key } });
    expect(mockedApi).toHaveBeenLastCalledWith(
      '/events/evt_test/admin/event-days/day%2Fa',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
  it('renders field-level and write feedback accessibly', () => {
    mount(<WriteFeedback error={new Error('Write refused')} saved formError="Choose a value" />);
    expect(screen.getAllByRole('alert').map((node) => node.textContent)).toEqual([
      expect.stringContaining('Choose a value'),
      expect.stringContaining('Write refused'),
    ]);
    expect(screen.getByRole('status').textContent).toContain('Saved.');
  });
});
const privateScreens = [
  { Screen: StationsScreen, label: 'Room One', path: '/admin/stations' },
  { Screen: DaysScreen, label: 'Event day', path: '/admin/event-days' },
  { Screen: CategoriesScreen, label: 'Guests', path: '/admin/structure' },
];
const deniedRead = (status: number) =>
  new ApiError(status, {
    code: 'FORBIDDEN',
    message: 'Private denied response sentinel',
    requestId: 'synthetic-denied',
  });
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('structure read ownership', () => {
  it.each(privateScreens)(
    'drops cached $label data and readers when read authority is revoked',
    async ({ Screen, label }) => {
      const view = mount(<Screen />);
      await screen.findAllByText(label);
      state.actions = ['Structure.Edit', 'Structure.Change'];
      view.rerender(view.wrap(<Screen />));
      expect(screen.getByText('Your role cannot read event structure.')).toBeTruthy();
      expect(screen.queryAllByText(label)).toHaveLength(0);
      await waitFor(() => expect(view.client.getQueryCache().getAll()).toHaveLength(0));
    },
  );
  it.each(privateScreens.flatMap((item) => [401, 403].map((status) => ({ ...item, status }))))(
    'drops cached $label and every private query after a refreshed $status read refusal',
    async ({ Screen, label, path, status }) => {
      const view = mount(<Screen />);
      await screen.findAllByText(label);
      const original = mockedApi.getMockImplementation()!;
      mockedApi.mockImplementation((url, options) =>
        url.endsWith(path) ? Promise.reject(deniedRead(status)) : original(url, options),
      );
      await act(async () => {
        await view.client.invalidateQueries({ queryKey: [state.eventId] });
      });
      await screen.findByText('Event structure access is unavailable. Reload your session.');
      expect(screen.queryAllByText(label)).toHaveLength(0);
      expect(screen.queryByText('Private denied response sentinel')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Reload structure' })).toBeNull();
      await waitFor(() => expect(view.client.getQueryCache().getAll()).toHaveLength(0));
    },
  );
  it.each(privateScreens)(
    'does not reuse $label data for another person in the same event',
    async ({ Screen, label }) => {
      const view = mount(<Screen />);
      await screen.findAllByText(label);
      expect(view.client.getQueryData(structureKeys.all('evt_test', 'person'))).toBeDefined();
      const late = deferred<never>();
      mockedApi.mockImplementation(() => late.promise);
      state.personId = 'other-person';
      view.rerender(view.wrap(<Screen />));
      expect(screen.queryAllByText(label)).toHaveLength(0);
      await waitFor(() =>
        expect(view.client.getQueryData(structureKeys.all('evt_test', 'person'))).toBeUndefined(),
      );
      expect(view.client.getQueryData(eventDayKeys.all('evt_test', 'person'))).toBeUndefined();
      expect(
        view.client
          .getQueryCache()
          .getAll()
          .every((query) => query.queryKey.includes('other-person')),
      ).toBe(true);
    },
  );
  it.each(privateScreens)(
    'cancels late $label reads across a person switch and a return to the original person',
    async ({ Screen, label }) => {
      const pending = deferred<unknown>();
      const original = mockedApi.getMockImplementation()!;
      const initialCalls: Array<{ path: string; signal: AbortSignal | undefined }> = [];
      mockedApi.mockImplementation((path, options) => {
        initialCalls.push({ path, signal: options?.signal });
        return pending.promise;
      });
      const view = mount(<Screen />);
      await waitFor(() => expect(initialCalls.length).toBeGreaterThan(0));
      mockedApi.mockImplementation(() => new Promise(() => undefined));
      state.personId = 'other-person';
      view.rerender(view.wrap(<Screen />));
      expect(initialCalls.every(({ signal }) => signal?.aborted)).toBe(true);
      state.personId = 'person';
      view.rerender(view.wrap(<Screen />));
      await act(async () => {
        pending.resolve(await original(initialCalls[0]!.path, undefined));
        await pending.promise;
      });
      expect(screen.queryAllByText(label)).toHaveLength(0);
      expect(view.client.getQueryData(structureKeys.all('evt_test', 'person'))).toBeUndefined();
    },
  );
});
describe('editor value derivations', () => {
  it('strips response-only fields and derives fresh defaults and nullable text', () => {
    expect(typeValues()).toMatchObject({ code: '', countsEntry: false });
    expect(typeValues(STRUCTURE_TYPE)).not.toHaveProperty('id');
    expect(tagValues()).toMatchObject({ description: '' });
    expect(tagValues({ ...STRUCTURE_TAG, description: null }).description).toBe('');
    expect(categoryValues()).toMatchObject({ active: true });
    expect(categoryValues(STRUCTURE.categories[0])).not.toHaveProperty('updatedAt');
    expect(dayValues()).toMatchObject({ date: '', isPublicDay: true });
    expect(dayValues(STRUCTURE_DAY)).not.toHaveProperty('shifts');
    expect(templateValues()).toMatchObject({ endsNextDay: false });
    expect(templateValues(STRUCTURE_TEMPLATE)).not.toHaveProperty('id');
    expect(stationValues()).toMatchObject({ tagCodes: [], floor: '' });
    expect(stationValues(STRUCTURE_STATION)).toMatchObject({
      typeCode: 'ROOM',
      tagCodes: ['GROUP'],
      floor: '',
    });
    expect(stationValues({ ...STRUCTURE_STATION, floor: 'Level A' }).floor).toBe('Level A');
  });
});
