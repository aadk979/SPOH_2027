import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { LOCAL_CONFIGURATION } from '../helpers/clientConfiguration';

const state = vi.hoisted(() => ({
  load: vi.fn(),
  bootstrap: vi.fn(),
  settings: vi.fn(),
  outbox: vi.fn(),
  push: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@/shared/lib/env', () => ({ loadClientConfiguration: state.load }));
vi.mock('@/shared/lib/session', () => ({ bootstrapSession: state.bootstrap }));
vi.mock('@/shared/lib/runtimeSettings', () => ({ loadClientSettings: state.settings }));
vi.mock('@/shared/lib/outbox', () => ({ startOutboxFlushLoop: state.outbox }));
vi.mock('@/features/notification', () => ({ usePushSubscriptionSync: state.push }));
beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockReset();
  state.bootstrap.mockResolvedValue(undefined);
  state.outbox.mockReturnValue(state.stop);
});
afterEach(() => cleanup());

describe('configuration startup gate', () => {
  it('holds screens, session bootstrap, settings, outbox and push until configuration succeeds', async () => {
    let finish: (value: unknown) => void = () => undefined;
    state.load.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <Providers>
        <p>Operational screen</p>
      </Providers>,
    );
    expect(screen.queryByText('Operational screen')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Loading application');
    for (const effect of [state.bootstrap, state.settings, state.outbox, state.push])
      expect(effect).not.toHaveBeenCalled();
    finish(LOCAL_CONFIGURATION);
    await screen.findByText('Operational screen');
    await waitFor(() => expect(state.settings).toHaveBeenCalledOnce());
    expect(state.bootstrap).toHaveBeenCalledOnce();
    expect(state.outbox).toHaveBeenCalledOnce();
    expect(state.push).toHaveBeenCalledOnce();
  });

  it('shows an actionable failure with no operational consumers, and starts only after successful retry', async () => {
    state.load
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce(LOCAL_CONFIGURATION);
    render(
      <Providers>
        <p>Operational screen</p>
      </Providers>,
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Operational screen')).toBeNull();
    for (const effect of [state.bootstrap, state.settings, state.outbox, state.push])
      expect(effect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Operational screen');
    expect(state.load).toHaveBeenCalledTimes(2);
    expect(state.bootstrap).toHaveBeenCalledOnce();
  });
});
