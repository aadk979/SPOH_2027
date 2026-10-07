import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSettingHistoryRecord, EventSettings } from '@spoh/shared';
import { LostPersonRetentionField } from '@/features/settings/components/LostPersonRetentionField';
import { productRevertWarning, productValueLabel } from '@/features/settings/model/productHistory';
import { api } from '@/shared/lib/api';

/** Lost-person retention: shorten only, within the 24 hours promised to families (D-16). */
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

function show(current = 12, canEdit = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <LostPersonRetentionField current={current} version={3} canEdit={canEdit} />
    </QueryClientProvider>,
  );
}

const input = () => screen.getByLabelText('Lost-person retention') as HTMLInputElement;
const type = (value: string) => fireEvent.change(input(), { target: { value } });
const writes = () => mockedApi.mock.calls.filter(([, options]) => options?.method === 'PATCH');

beforeEach(() => {
  mockedApi.mockReset().mockResolvedValue({});
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe('lost-person retention field', () => {
  it('saves a longer value up to 24 hours at once, at the version read', async () => {
    show(12);
    type('24');
    fireEvent.click(screen.getByRole('button', { name: 'Save retention' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      '/events/evt_test/admin/event-settings',
      { method: 'PATCH', body: { key: 'lostPersonPurgeHours', value: 24, expectedVersion: 3 } },
    ]);
  });

  it('asks before shortening, and sends nothing until confirmed', async () => {
    show(12);
    type('6');
    fireEvent.click(screen.getByRole('button', { name: 'Save retention' }));
    expect(screen.getByText(/resolved more than 6 hours ago are removed/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Keep 12 hours' }));
    expect(writes()).toHaveLength(0);
    expect(screen.queryByText(/resolved more than 6 hours ago/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save retention' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 6 hours' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.[1]?.body).toEqual({
      key: 'lostPersonPurgeHours',
      value: 6,
      expectedVersion: 3,
    });
  });

  it('offers no save above 24 hours, below 1 or for a part hour', () => {
    show(12);
    for (const value of ['25', '720', '0', '1.5', '']) {
      type(value);
      expect(screen.queryByRole('button', { name: 'Save retention' })).toBeNull();
      expect(screen.getByText('A whole number of hours from 1 to 24.')).toBeTruthy();
    }
  });

  it('is read-only without config.manage', () => {
    show(12, false);
    expect(input().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save retention' })).toBeNull();
  });
});

describe('retention history', () => {
  const row = (after: number) =>
    ({
      key: 'lostPersonPurgeHours',
      values: { available: true, before: 24, after },
    }) as EventSettingHistoryRecord;
  const current = { lostPersonPurgeHours: 12 } as EventSettings;

  it('labels values in hours', () => {
    expect(productValueLabel(6)).toBe('6 hours after resolution');
  });

  it('warns only when a restore would shorten retention', () => {
    expect(productRevertWarning(row(6), current)).toMatch(/cannot be recovered/);
    expect(productRevertWarning(row(24), current)).toBeNull();
    expect(productRevertWarning(row(12), current)).toBeNull();
  });
});
