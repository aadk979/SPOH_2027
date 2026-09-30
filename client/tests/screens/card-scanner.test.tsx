import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCardScanner } from '@/features/capture/useCardScanner';
import { api } from '@/shared/lib/api';
import { TEST_EVENT } from '../helpers/event';

/** The test event's API paths and screen addresses (tests/setup.ts). */
const API = `/events/${TEST_EVENT.id}`;

const scanner = vi.hoisted(() => ({ onDecode: (_text: string) => {} }));
vi.mock('@/features/capture/useQrScanner', () => ({
  useQrScanner: (options: { onDecode(text: string): void }) => {
    scanner.onDecode = options.onDecode;
    return { state: 'scanning' };
  },
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const mockedApi = vi.mocked(api);

// No per-test reset of the api mock: with one, Vitest reports the handled rejection below as a failure.
afterEach(cleanup);

describe('scanning a printed card (F03-045)', () => {
  it('resolves the QR payload to the card before acting on it', async () => {
    mockedApi.mockResolvedValue({ card: { shortCode: 'BBB222' } });
    const onCode = vi.fn(() => Promise.resolve());
    renderHook(() => useCardScanner(onCode, vi.fn()));
    scanner.onDecode('spoh2027:0f8f6a52-3c2b-4d7e-9a61-5b7c2d9e1f00');

    await waitFor(() => expect(onCode).toHaveBeenCalledWith('BBB222'));
    expect(mockedApi).toHaveBeenCalledWith(
      `${API}/cards/qr/${encodeURIComponent('spoh2027:0f8f6a52-3c2b-4d7e-9a61-5b7c2d9e1f00')}`,
    );
  });

  it('acts on a bare code without asking the server', async () => {
    const onCode = vi.fn(() => Promise.resolve());
    const callsBefore = mockedApi.mock.calls.length;
    renderHook(() => useCardScanner(onCode, vi.fn()));
    scanner.onDecode('abc12o');
    await waitFor(() => expect(onCode).toHaveBeenCalledWith('ABC120'));
    expect(mockedApi.mock.calls.length).toBe(callsBefore);
  });

  it('asks for the typed code when the payload cannot be resolved', async () => {
    mockedApi.mockImplementation(() => Promise.reject(new Error('offline')));
    const codes: string[] = [];
    let unresolved = 0;
    renderHook(() =>
      useCardScanner(
        async (code) => void codes.push(code),
        () => (unresolved += 1),
      ),
    );
    scanner.onDecode('spoh2027:unknown');
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(unresolved).toBe(1);
    expect(codes).toEqual([]);
  });
});
