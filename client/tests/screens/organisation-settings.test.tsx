import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganisationSettingsResponse } from '@spoh/shared';
import { OrganisationSettingsForm } from '@/features/settings/components/OrganisationSettingsForm';
import { api } from '@/shared/lib/api';

/** Organisation-wide settings: everyone with config.manage reads, platform admins change (D-17). */
vi.mock('@/shared/lib/eventContext', async (original) => ({
  ...(await original<typeof import('@/shared/lib/eventContext')>()),
  useEventId: () => 'evt_test',
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];
let response: OrganisationSettingsResponse;

function settings(canChange: boolean): OrganisationSettingsResponse {
  return {
    organisationId: 'org',
    settings: {
      dashboardPollSeconds: 3,
      alertPollSeconds: 10,
      refreshSessionDays: 30,
      idempotencyRetentionDays: 7,
    },
    versions: {
      dashboardPollSeconds: 0,
      alertPollSeconds: 0,
      refreshSessionDays: 2,
      idempotencyRetentionDays: 0,
    },
    canChange,
  };
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <OrganisationSettingsForm enabled />
    </QueryClientProvider>,
  );
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const writes = () => mockedApi.mock.calls.filter(([, options]) => options?.method === 'PATCH');

beforeEach(() => {
  mockedApi.mockReset().mockImplementation(async () => response);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('organisation settings form', () => {
  it('shows the values that apply, read-only, to someone who is not a platform admin', async () => {
    response = settings(false);
    show();
    await waitFor(() => expect(field('Session lifetime').value).toBe('30'));
    for (const label of [
      'Dashboard refresh',
      'Alert refresh',
      'Session lifetime',
      'Replay retention',
    ])
      expect(field(label).disabled).toBe(true);
    expect(screen.getByText(/Only a platform admin can change them/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets a platform admin save one key at the version read', async () => {
    response = settings(true);
    show();
    await waitFor(() => expect(field('Session lifetime').disabled).toBe(false));
    fireEvent.change(field('Session lifetime'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save session lifetime' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      '/events/evt_test/admin/organisation-settings',
      {
        method: 'PATCH',
        body: { key: 'refreshSessionDays', value: 7, expectedVersion: 2 },
      },
    ]);
  });

  it('offers no save outside the registered bounds', async () => {
    response = settings(true);
    show();
    await waitFor(() => expect(field('Alert refresh').disabled).toBe(false));
    for (const value of ['4', '31', '7.5', '']) {
      fireEvent.change(field('Alert refresh'), { target: { value } });
      expect(screen.queryByRole('button', { name: 'Save alert refresh' })).toBeNull();
      expect(screen.getByText('A whole number from 5 to 30.')).toBeTruthy();
    }
  });
});
