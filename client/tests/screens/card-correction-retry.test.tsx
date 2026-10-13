import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MissionCardRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';
import { useCardCorrections } from '@/features/cards/queries';

vi.mock('@/shared/lib/eventContext', () => ({ useEventId: () => 'event-a' }));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()), api: vi.fn(),
}));
const mockedApi = vi.mocked(api);
const card: MissionCardRecord = { id: 'card-a', shortCode: 'ABC123', status: 'ISSUED',
  rehearsal: false, issuedAt: '2027-01-08T01:00:00.000Z', completedAt: null, voidedAt: null,
  reissuedFromId: null, batchLabel: null, stamps: [], remainingStationIds: [], redeemed: false };
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  const onChange = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(({ current }) => useCardCorrections(current, onChange),
    { initialProps: { current: card }, wrapper }), onChange };
}
async function correct(hook: ReturnType<typeof useCardCorrections>, kind: 'void' | 'reissue', reason: string) {
  await act(async () => {
    try {
      if (kind === 'void') await hook.voidMutation.mutateAsync({ reason });
      else await hook.reissue.mutateAsync({ reason, replacementShortCode: 'ABC124' });
    } catch { /* An ambiguous transport failure keeps the pending intent. */ }
  });
}
const bodyAt = (index: number) => mockedApi.mock.calls[index]![1]!.body as { idempotencyKey: string };
beforeEach(() => { mockedApi.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); });

it.each(['void', 'reissue'] as const)('retains a failed %s UUID and clears it only after the confirmed effect', async (kind) => {
  const saved = kind === 'void' ? { card: { ...card, status: 'VOIDED', voidedAt: '2027-01-08T01:01:00.000Z' } }
    : { card: { ...card, id: 'card-b', shortCode: 'ABC124', reissuedFromId: card.id }, voidedCardId: card.id, stampsCarriedOver: 0 };
  mockedApi.mockRejectedValueOnce(new Error('Transport timed out')).mockResolvedValue(saved);
  const hook = mount();
  await correct(hook.result.current, kind, 'Reviewed physical card correction');
  expect(hook.onChange).not.toHaveBeenCalled();
  const key = bodyAt(0).idempotencyKey;
  expect(key).toMatch(/^[0-9a-f-]{36}$/);
  await correct(hook.result.current, kind, 'Reviewed physical card correction');
  expect(bodyAt(1)).toEqual(bodyAt(0));
  expect(hook.onChange).toHaveBeenCalledExactlyOnceWith(saved.card);
  await correct(hook.result.current, kind, 'Reviewed physical card correction');
  expect(bodyAt(2).idempotencyKey).not.toBe(key);
  expect(mockedApi.mock.calls[0]![0]).toBe(`/events/event-a/cards/ABC123/${kind}`);
});

it.each(['void', 'reissue'] as const)('uses a new %s UUID when its reason or original code changes after a timeout', async (kind) => {
  mockedApi.mockRejectedValue(new Error('Unknown result'));
  const hook = mount();
  await correct(hook.result.current, kind, 'First reviewed reason');
  await correct(hook.result.current, kind, 'Different reviewed reason');
  expect(bodyAt(1).idempotencyKey).not.toBe(bodyAt(0).idempotencyKey);
  hook.rerender({ current: { ...card, shortCode: 'ABC125' } });
  await correct(hook.result.current, kind, 'Different reviewed reason');
  expect(bodyAt(2).idempotencyKey).not.toBe(bodyAt(1).idempotencyKey);
  expect(mockedApi.mock.calls[2]![0]).toBe(`/events/event-a/cards/ABC125/${kind}`);
  expect(hook.onChange).not.toHaveBeenCalled();
});

it('retains independent pending receipts for void and reissue intents on the same card', async () => {
  mockedApi.mockRejectedValue(new Error('Unknown result'));
  const hook = mount();
  await correct(hook.result.current, 'void', 'Reviewed physical card correction');
  await correct(hook.result.current, 'reissue', 'Reviewed physical card correction');
  await correct(hook.result.current, 'void', 'Reviewed physical card correction');
  expect(bodyAt(1).idempotencyKey).not.toBe(bodyAt(0).idempotencyKey);
  expect(bodyAt(2)).toEqual(bodyAt(0));
});
