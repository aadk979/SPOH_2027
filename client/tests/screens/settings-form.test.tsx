import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATED_SETTING_DEFAULTS, RuntimeSettings, type SettingsResponse } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { useSettingsForm, type SettingsForm } from '@/features/settings/hooks/useSettingsForm';
import { EventNameField } from '@/features/settings/components/EventNameField';
import { ThresholdsForm } from '@/features/settings/components/ThresholdsForm';
import { SettingsApply } from '@/features/settings/components/SettingsApply';
import { SettingsFeedback } from '@/features/settings/components/SettingsFeedback';
import { settingsKeys } from '@/features/settings/queries';
import { TEST_EVENT } from '../helpers/event';

const event = vi.hoisted(() => ({ id: 'evt_test' }));
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => event.id,
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
let response: SettingsResponse;
let latestForm: SettingsForm;
function Harness({ enabled = true }: { enabled?: boolean }) {
  const form = useSettingsForm(enabled);
  latestForm = form;
  return (
    <>
      <SettingsFeedback form={form} canEdit />
      <EventNameField form={form} canEdit />
      <ThresholdsForm form={form} canEdit />
      <SettingsApply form={form} canEdit />
    </>
  );
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    ...render(<Harness />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }),
  };
}
function writes() {
  return mockedApi.mock.calls.filter(([, options]) => options?.method === 'PATCH');
}
async function loaded() {
  await waitFor(() =>
    expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe(
      response.settings.eventName,
    ),
  );
}
beforeEach(() => {
  event.id = TEST_EVENT.id;
  response = {
    settings: RuntimeSettings.parse(
      Object.fromEntries(
        Object.keys(RuntimeSettings.shape).map((key) => [
          key,
          GENERATED_SETTING_DEFAULTS[key as keyof RuntimeSettings],
        ]),
      ),
    ),
    overriddenKeys: [],
    updatedAt: null,
    updatedById: null,
    updatedByName: null,
  };
  mockedApi.mockReset();
  mockedApi.mockImplementation(async (_path, options) => {
    if (options?.method === 'PATCH')
      response = {
        ...response,
        settings: { ...response.settings, ...(options.body as object) },
        overriddenKeys: [
          ...new Set([...response.overriddenKeys, ...Object.keys(options.body as object)]),
        ],
      };
    return response;
  });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('settings moved to the settings catalogue', () => {
  const moved = [
    'Silent station',
    'Stale device',
    'Implausible tap rate',
    'Long shift',
    'Undo window',
    'Send grace',
    'Unsent capture warning',
    'Oldest unsent warning',
  ] as const;

  it.each(moved)(
    'shows %s as a pointer, not an editable field with a live value',
    async (label) => {
      show();
      await loaded();
      expect(screen.queryByLabelText(label)).toBeNull();
      expect(screen.getByText(label)).toBeTruthy();
      expect(screen.getAllByText(/Settings catalogue above/).length).toBe(moved.length);
      expect(screen.getAllByText(/or station scope/).length).toBe(2);
    },
  );

  it('shows lost-person retention as a pointer to the event’s visitor data settings', async () => {
    show();
    await loaded();
    expect(screen.queryByLabelText('Lost-person retention')).toBeNull();
    expect(
      screen.getAllByText('Changed under Counts and visitor data above, for this event.'),
    ).toHaveLength(1);
  });

  it('never sends a moved key, even when the server value changed under the draft', async () => {
    const { client } = show();
    await loaded();
    response = {
      ...response,
      settings: {
        ...response.settings,
        silentStationMinutes: response.settings.silentStationMinutes + 1,
        longShiftMinutes: response.settings.longShiftMinutes + 1,
        captureUndoWindowSeconds: response.settings.captureUndoWindowSeconds + 1,
        outboxWarningCount: response.settings.outboxWarningCount + 1,
      },
    };
    await act(async () => {
      client.setQueryData(settingsKeys.current(TEST_EVENT.id), response);
    });
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Reviewed event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.[1]?.body).toEqual({ eventName: 'Reviewed event' });
  });
});

describe('settings form changed-key writes', () => {
  it('sends nothing while loading or when the loaded form is unchanged', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
      true,
    );
    act(() => latestForm.onSave());
    await loaded();
    act(() => latestForm.onSave());
    expect(writes()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('writes only the edited name and leaves untouched defaults unoverridden', async () => {
    show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), {
      target: { value: ' Reviewed event ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      `/events/${TEST_EVENT.id}/admin/settings`,
      { method: 'PATCH', body: { eventName: 'Reviewed event' } },
    ]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
        true,
      ),
    );
    expect(response.overriddenKeys).toEqual(['eventName']);
    act(() => latestForm.onSave());
    expect(writes()).toHaveLength(1);
  });

  it('treats trimmed names and equivalent numeric input as unchanged', async () => {
    show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), {
      target: { value: ` ${response.settings.eventName} ` },
    });
    const threshold = screen.getByLabelText('Alert refresh');
    fireEvent.change(threshold, {
      target: { value: `${response.settings.alertPollSeconds}.0` },
    });
    act(() => latestForm.onSave());
    expect(writes()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('validates the full form before sending a changed numeric key', async () => {
    show();
    await loaded();
    const threshold = screen.getByLabelText('Alert refresh');
    fireEvent.change(threshold, { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(writes()).toEqual([]);
    expect(threshold.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(threshold, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.[1]?.body).toEqual({ alertPollSeconds: 30 });
  });

  it('keeps an edited draft across a refresh and does not rewrite another changed key', async () => {
    const { client } = show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Reviewed event' } });
    response = {
      ...response,
      settings: {
        ...response.settings,
        alertPollSeconds: response.settings.alertPollSeconds + 1,
      },
    };
    await act(async () => {
      client.setQueryData(settingsKeys.current(TEST_EVENT.id), response);
    });
    expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe('Reviewed event');
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.[1]?.body).toEqual({ eventName: 'Reviewed event' });
    await loaded();
    expect((screen.getByLabelText('Alert refresh') as HTMLInputElement).value).toBe(
      String(response.settings.alertPollSeconds),
    );
  });

  it('blocks duplicate saves and editing during an in-flight request', async () => {
    let finish!: (value: SettingsResponse) => void;
    mockedApi.mockImplementation(async (_path, options) =>
      options?.method === 'PATCH'
        ? new Promise<SettingsResponse>((resolve) => {
            finish = resolve;
          })
        : response,
    );
    show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Reviewed event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(screen.getByLabelText('Event name').hasAttribute('disabled')).toBe(true);
    expect(screen.getByLabelText('Alert refresh').hasAttribute('disabled')).toBe(true);
    act(() => latestForm.onSave());
    expect(writes()).toHaveLength(1);
    await act(async () => {
      response = { ...response, settings: { ...response.settings, eventName: 'Reviewed event' } };
      finish(response);
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
        true,
      ),
    );
  });

  it('keeps a failed save retryable with the same changed keys', async () => {
    let fails = true;
    mockedApi.mockImplementation(async (_path, options) => {
      if (options?.method === 'PATCH' && fails) throw new Error('offline');
      if (options?.method === 'PATCH')
        response = { ...response, settings: { ...response.settings, eventName: 'Reviewed event' } };
      return response;
    });
    show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Reviewed event' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await screen.findByText('Not saved');
    expect((screen.getByLabelText('Event name') as HTMLInputElement).value).toBe('Reviewed event');
    fails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(writes().map(([, options]) => options?.body)).toEqual([
      { eventName: 'Reviewed event' },
      { eventName: 'Reviewed event' },
    ]);
  });

  it('seeds the next event independently, including a prepopulated query', async () => {
    const { client, rerender } = show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), {
      target: { value: 'First event draft' },
    });
    response = { ...response, settings: { ...response.settings, eventName: 'Next event' } };
    client.setQueryData(settingsKeys.current('next-event'), response);
    event.id = 'next-event';
    rerender(<Harness />);
    await loaded();
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
      true,
    );
    act(() => latestForm.onSave());
    expect(writes()).toEqual([]);
    fireEvent.change(screen.getByLabelText('Event name'), {
      target: { value: 'Next event reviewed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      '/events/next-event/admin/settings',
      { method: 'PATCH', body: { eventName: 'Next event reviewed' } },
    ]);
  });

  it('blocks a draft when its current read fails or the session is disabled', async () => {
    const { client, rerender } = show();
    await loaded();
    fireEvent.change(screen.getByLabelText('Event name'), { target: { value: 'Reviewed event' } });
    mockedApi.mockRejectedValue(new Error('read denied'));
    await act(async () => {
      await client.refetchQueries({ queryKey: settingsKeys.current(TEST_EVENT.id) });
    });
    await screen.findByText('Settings unavailable');
    expect(screen.getByRole('button', { name: 'Save settings' }).hasAttribute('disabled')).toBe(
      true,
    );
    act(() => latestForm.onSave());
    expect(writes()).toEqual([]);
    rerender(<Harness enabled={false} />);
    act(() => latestForm.onSave());
    expect(writes()).toEqual([]);
  });
});
