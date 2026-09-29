import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import NewIncidentScreen from '@/features/incident/screens/NewIncidentScreen';
import NewLostFoundScreen from '@/features/lostFound/screens/NewLostFoundScreen';
import RaiseLostPersonScreen from '@/features/lostPerson/screens/RaiseLostPersonScreen';
import { z } from 'zod';
import { api } from '@/shared/lib/api';
const state = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/features/session', () => ({
  useRequireSession: () => ({ accessToken: 'fixture' }),
  useMe: () => ({
    data: {
      currentAssignment: {
        station: { id: '11111111-1111-4111-8111-111111111111', name: 'Test room' },
      },
    },
  }),
}));
vi.mock('@/features/media', () => ({ usePhotoUpload: () => ({ available: false, key: null }) }));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api),
  clients: QueryClient[] = [];
const forms = [
  {
    name: 'incident',
    node: <NewIncidentScreen />,
    label: 'What happened?',
    value: '  Cable across walkway  ',
    endpoint: '/incidents',
    body: {
      type: 'NEAR_MISS',
      severity: 'LOW',
      stationId: '11111111-1111-4111-8111-111111111111',
      description: 'Cable across walkway',
      occurredAt: expect.any(String),
      idempotencyKey: expect.any(String),
    },
    destination: '/home',
    failure: 'The report could not be sent. Tell your IC directly, then try again.',
    optional: { label: /Where, exactly/, max: 200 },
  },
  {
    name: 'found item',
    node: <NewLostFoundScreen />,
    label: 'What is it?',
    value: '  Blue bottle  ',
    endpoint: '/lost-found',
    body: {
      itemLabel: 'Blue bottle',
      foundStationId: '11111111-1111-4111-8111-111111111111',
      foundAt: expect.any(String),
    },
    destination: '/safety/lost-found',
    failure: 'Could not save. Check your connection and try again.',
    optional: { label: /Kind of thing/, max: 60 },
  },
  {
    name: 'lost person',
    node: <RaiseLostPersonScreen />,
    label: 'What has happened, and who are we looking for?',
    value: '  Child separated from group  ',
    endpoint: '/lost-person',
    body: {
      descriptionText: 'Child separated from group',
      lastSeenStationId: '11111111-1111-4111-8111-111111111111',
      lastSeenAt: expect.any(String),
      idempotencyKey: expect.any(String),
    },
    destination: '/home',
    failure:
      'The alert could not be sent. Call your IC on the radio now — do not wait for this screen.',
    optional: { label: /Approximate age/, max: 40 },
  },
];
function show(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
beforeEach(() => {
  mockedApi.mockReset();
  state.replace.mockReset();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});
describe.each(forms)('$name form', (form) => {
  it('does not submit an empty description even if the form event fires', () => {
    show(form.node);
    fireEvent.submit(screen.getByLabelText(form.label).closest('form')!);
    expect(mockedApi).not.toHaveBeenCalled();
    expect(state.replace).not.toHaveBeenCalled();
  });
  it('trims the description and omits empty optional fields', async () => {
    mockedApi.mockResolvedValue({});
    show(form.node);
    fireEvent.change(screen.getByLabelText(form.label), { target: { value: form.value } });
    fireEvent.submit(screen.getByLabelText(form.label).closest('form')!);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith(form.destination));
    expect(mockedApi).toHaveBeenCalledWith(form.endpoint, { method: 'POST', body: form.body });
  });
  it('retains the entered description and gives the existing escalation message on failure', async () => {
    mockedApi.mockRejectedValue(new Error('offline'));
    show(form.node);
    fireEvent.change(screen.getByLabelText(form.label), { target: { value: form.value } });
    fireEvent.submit(screen.getByLabelText(form.label).closest('form')!);
    await screen.findByText(form.failure);
    expect(state.replace).not.toHaveBeenCalled();
    expect((screen.getByLabelText(form.label) as HTMLInputElement).value).toBe(form.value);
    expect(
      screen
        .getByRole('button', { name: /Submit report|Log this item|Alert every volunteer now/ })
        .hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe.each(forms)('$name form validation', (form) => {
  it('shows the schema message on the described field and sends nothing', () => {
    show(form.node);
    fireEvent.submit(screen.getByLabelText(form.label).closest('form')!);
    const field = screen.getByLabelText(form.label);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(`${field.id}-error`)?.textContent).toBeTruthy();
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it('rejects an over-long optional field, then submits once it is corrected', async () => {
    mockedApi.mockResolvedValue({});
    show(form.node);
    const tooLong = 'x'.repeat(form.optional.max + 1);
    const expected = z.string().max(form.optional.max).safeParse(tooLong).error?.issues[0]?.message;
    fireEvent.change(screen.getByLabelText(form.label), { target: { value: form.value } });
    const optional = screen.getByLabelText(form.optional.label);
    fireEvent.change(optional, { target: { value: tooLong } });
    fireEvent.submit(optional.closest('form')!);
    expect(document.getElementById(`${optional.id}-error`)?.textContent).toBe(expected);
    expect(mockedApi).not.toHaveBeenCalled();

    fireEvent.change(optional, { target: { value: '   ' } });
    expect(optional.getAttribute('aria-invalid')).toBeNull();
    fireEvent.submit(optional.closest('form')!);
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith(form.destination));
    // A blank optional field is omitted, exactly as before the migration.
    expect(mockedApi).toHaveBeenCalledWith(form.endpoint, { method: 'POST', body: form.body });
  });
});
