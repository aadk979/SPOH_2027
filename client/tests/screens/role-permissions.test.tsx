import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { RolePermissionsResponse } from '@spoh/shared';
import PermissionsScreen from '@/features/permissions/screens/PermissionsScreen';
import {
  asLine,
  canToggle,
  cellState,
  groupedRows,
} from '@/features/permissions/model/permissionTable';
import { api } from '@/shared/lib/api';
import { NetworkError } from '@/shared/lib/apiErrors';

/** The role permissions screen (P11.7): the table by role, the toggles, and the simulator. */
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/features/session', async (original) => ({
  ...(await original<typeof import('@/features/session')>()),
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useCurrentSession: () => ({ accessToken: 'fixture' }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const clients: QueryClient[] = [];

function table(canEdit: boolean): RolePermissionsResponse['data'] {
  return {
    roles: [
      { role: 'VOLUNTEER', rank: 10, grants: ['Registration.Create'], anyStation: false },
      { role: 'IC', rank: 20, grants: ['Registration.Create', 'Swap.Decide'], anyStation: true },
    ],
    actions: [
      {
        action: 'Registration.Create',
        label: 'register visitors',
        groups: ['Capture', 'Editable', 'Write'],
        editable: true,
        minimumRole: 'VOLUNTEER',
      },
      {
        action: 'Swap.Decide',
        label: 'approve or decline shift swaps',
        groups: ['Editable', 'Manage', 'Write'],
        editable: true,
        minimumRole: 'IC',
      },
      {
        action: 'Self.Read',
        label: 'see your own details',
        groups: ['Self'],
        editable: false,
        minimumRole: null,
      },
    ],
    guardrails: [
      { id: 'guardrail.not-on-yourself', explanation: 'Nobody changes their own role.' },
    ],
    canEdit,
    review: { version: 3, reviewedVersion: null, reviewedAt: null },
  };
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <PermissionsScreen />
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

describe('the permission table model', () => {
  it('groups by the first heading group and tells each cell apart', () => {
    const data = table(true);
    expect(groupedRows(data).map((section) => section.group)).toEqual([
      'Capture',
      'Manage',
      'Self',
    ]);
    const [volunteer, ic] = data.roles;
    const [registration, swaps, self] = data.actions;
    expect(cellState(registration!, volunteer!, data)).toBe('granted');
    expect(cellState(swaps!, volunteer!, data)).toBe('below-minimum');
    expect(cellState(swaps!, ic!, data)).toBe('granted');
    expect(cellState(self!, ic!, data)).toBe('fixed');
    expect(canToggle('granted', true)).toBe(true);
    expect(canToggle('available', false)).toBe(false);
    expect(canToggle('fixed', true)).toBe(false);
    expect(asLine('register visitors')).toBe('Register visitors');
  });
});

describe('the role permissions screen', () => {
  it('records only a confirmed review of the current version and keeps an uncertain retry identical', async () => {
    const attempts: unknown[] = [];
    mockedApi.mockImplementation(async (path, options) => {
      if (String(path).endsWith('/permissions/review')) {
        attempts.push(options?.body);
        if (attempts.length === 1) throw new NetworkError('Synthetic unavailable response');
        return {
          data: {
            ...table(true),
            review: { version: 3, reviewedVersion: 3, reviewedAt: '2027-01-01T03:00:00Z' },
          },
        };
      }
      if (String(path).endsWith('/permissions')) return { data: table(true) };
      return { data: [], meta: { count: 0, nextCursor: null } };
    });
    show();
    const submit = await screen.findByRole('button', { name: 'Mark current permissions reviewed' });
    expect(submit).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Review reason'), {
      target: { value: '  Reviewed event role permissions  ' },
    });
    fireEvent.click(
      screen.getByLabelText('I have reviewed the current role permissions and guardrails'),
    );
    fireEvent.click(submit);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same permissions review' }));
    await screen.findByText(/Current permissions are reviewed/);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[0]).toMatchObject({
      expectedVersion: 3,
      reason: 'Reviewed event role permissions',
      idempotencyKey: expect.any(String),
    });
  });
  it('lets a platform admin revoke a grant, sending the role and action', async () => {
    mockedApi.mockImplementation(async (path, options) => {
      if (String(path).endsWith('/permissions') && !options?.method) return { data: table(true) };
      if (options?.method === 'PUT') return { data: table(true) };
      return { data: [], meta: { count: 0, nextCursor: null } };
    });
    show();
    const box = await screen.findByRole('checkbox', { name: 'Register visitors' });
    expect(box).toHaveProperty('checked', true);
    fireEvent.click(box);
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith(
        expect.stringMatching(/\/permissions$/),
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            role: 'VOLUNTEER',
            action: 'Registration.Create',
            granted: false,
          }),
        }),
      ),
    );
  });

  it('shows the table read-only to someone who may not edit', async () => {
    mockedApi.mockImplementation(async (path) =>
      String(path).endsWith('/permissions')
        ? { data: table(false) }
        : { data: [], meta: { count: 0, nextCursor: null } },
    );
    show();
    const box = await screen.findByRole('checkbox', { name: 'Register visitors' });
    expect(box).toHaveProperty('disabled', true);
    expect(screen.getByText('Only platform admins change these.')).toBeTruthy();
    expect(screen.getByText('Nobody changes their own role.')).toBeTruthy();
  });

  it('explains a refusal from the simulator', async () => {
    mockedApi.mockImplementation(async (path, options) => {
      const url = String(path);
      if (url.endsWith('/permissions') && !options?.method) return { data: table(false) };
      if (url.includes('/admin/volunteers')) {
        return {
          data: [{ id: 'p-1', displayName: 'Alex Tan' }],
          meta: { count: 1, nextCursor: null },
        };
      }
      if (url.endsWith('/permissions/simulate')) {
        return {
          data: {
            allowed: false,
            policies: [],
            explanation:
              'Their role has not been given permission to approve or decline shift swaps.',
          },
        };
      }
      if (url.includes('/permissions/people/')) {
        return {
          data: { personId: 'p-1', role: 'VOLUNTEER', actions: { 'Registration.Create': true } },
        };
      }
      return { data: [], meta: { count: 0, nextCursor: null } };
    });
    show();
    const person = await screen.findByLabelText('Person');
    await screen.findByRole('option', { name: 'Alex Tan' });
    fireEvent.change(person, { target: { value: 'p-1' } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'Swap.Decide' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Refused')).toBeTruthy();
    expect(
      screen.getByText(
        'Their role has not been given permission to approve or decline shift swaps.',
      ),
    ).toBeTruthy();
    expect(await screen.findByText('They can:')).toBeTruthy();
  });
});
