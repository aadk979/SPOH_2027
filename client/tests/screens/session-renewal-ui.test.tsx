import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionRenewalNotice } from '@/shared/shell/SessionRenewalNotice';
import { clearSession, setSession } from '@/shared/lib/session';

const recovery = vi.hoisted(() => ({ handoff: vi.fn<() => Promise<'redirecting'>>() }));
vi.mock('@/shared/lib/sessionHandoff', () => ({
  needsSessionHandoff: async () => true,
  recoverThroughHandoff: recovery.handoff,
}));

function DraftForm() {
  const [draft, setDraft] = useState('');
  return (
    <>
      <SessionRenewalNotice />
      <label>
        Unsaved draft
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  recovery.handoff.mockReset();
  recovery.handoff.mockResolvedValue('redirecting');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  setSession({
    accessToken: 'thin-proof', volunteerId: 'person_a', displayName: 'Sample', role: 'VOLUNTEER',
    expiresAt: Date.now() + 120_000, refreshAvailable: true,
  });
});
afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe('explicit session renewal notice', () => {
  it('preserves unsaved input and starts renewal only after a single explicit click', async () => {
    render(<DraftForm />);
    fireEvent.change(screen.getByLabelText('Unsaved draft'), { target: { value: 'Keep my edits.' } });
    expect(screen.queryByRole('button', { name: 'Renew session' })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText(/Save any changes before continuing/)).toBeTruthy();
    expect(recovery.handoff).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Keep my edits.');
    let finish!: (value: 'redirecting') => void;
    recovery.handoff.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Renew session' })));
    const pending = screen.getByRole('button', { name: 'Starting renewal…' });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(recovery.handoff).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Keep my edits.');
    await act(async () => finish('redirecting'));
  });

  it('blocks renewal while offline without discarding the draft or renewing on reconnection', async () => {
    render(<DraftForm />);
    fireEvent.change(screen.getByLabelText('Unsaved draft'), { target: { value: 'Offline edits.' } });
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    const button = screen.getByRole('button', { name: 'Renew session' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/read saved guides and record captures offline/)).toBeTruthy();
    fireEvent.click(button);
    await act(() => vi.advanceTimersByTimeAsync(60_001));
    expect(recovery.handoff).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Unsaved draft')).toHaveValue('Offline edits.');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    expect(button).toBeEnabled();
    expect(recovery.handoff).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(button));
    expect(recovery.handoff).toHaveBeenCalledOnce();
  });
});
