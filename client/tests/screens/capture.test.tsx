import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import RegistrationPage from '@/app/capture/registration/page';
import FootfallPage from '@/app/capture/footfall/page';

const state = vi.hoisted(() => ({
  signedIn: true,
  station: { id: 'station-1', name: 'Test Room', countsEntry: true } as {
    id: string;
    name: string;
    countsEntry: boolean;
  } | null,
  capture: vi.fn(),
  undo: vi.fn(),
  undoable: null as { id: string; label: string; at: number } | null,
  error: null as string | null,
}));

vi.mock('@/shared/shell/AppShell', () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));
vi.mock('@/shared/shell/SyncIndicator', () => ({ SyncIndicator: () => null }));
vi.mock('@/features/session/useSession', () => ({
  useRequireSession: () => (state.signedIn ? { accessToken: 'test' } : null),
  useMe: () => ({ data: { currentAssignment: state.station ? { station: state.station } : null } }),
}));
vi.mock('@/shared/hooks/useWakeLock', () => ({ useWakeLock: vi.fn() }));
vi.mock('@/features/capture/useCapture', () => ({
  useCapture: () => ({
    sessionCount: 3,
    undoable: state.undoable,
    error: state.error,
    capture: state.capture,
    undo: state.undo,
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: undefined }) }));

beforeEach(() => {
  state.signedIn = true;
  state.station = { id: 'station-1', name: 'Test Room', countsEntry: true };
  state.undoable = null;
  state.error = null;
  state.capture.mockReset();
  state.undo.mockReset();
});
afterEach(cleanup);

describe('registration screen safety net', () => {
  it('sends a category tap directly to the assigned station', () => {
    render(<RegistrationPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sec 4' }));
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({
      endpoint: '/registrations',
      body: { category: 'SEC_4', stationId: 'station-1' },
      label: 'Sec 4',
    });
  });

  it('closes capture when there is no assignment', () => {
    state.station = null;
    render(<RegistrationPage />);
    expect(screen.getByText('Registration is closed on this device')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sec 4' })).toBeNull();
    expect(state.capture).not.toHaveBeenCalled();
  });

  it('offers undo only while the queued tap is undoable', () => {
    state.undoable = { id: 'tap-1', label: 'Sec 4', at: 0 };
    const view = render(<RegistrationPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(state.undo).toHaveBeenCalledOnce();
    state.undoable = null;
    view.rerender(<RegistrationPage />);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('shows a local queue failure without removing the capture buttons', () => {
    state.error = 'Device storage is full';
    render(<RegistrationPage />);
    expect(screen.getByRole('alert').textContent).toContain(state.error);
    expect(screen.getByRole('button', { name: 'Sec 4' })).toBeTruthy();
  });
});

describe('footfall screen safety net', () => {
  it('counts one entry at the assigned room without a station selector', () => {
    render(<FootfallPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Count one entry to Test Room' }));
    expect(state.capture).toHaveBeenCalledExactlyOnceWith({
      endpoint: '/footfall/ticks',
      body: { stationId: 'station-1' },
      label: 'entry',
    });
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('does not count at a station that is not a counted room', () => {
    state.station = { id: 'station-1', name: 'Test Room', countsEntry: false };
    render(<FootfallPage />);
    expect(screen.getByText('This counter is closed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Count one entry/ })).toBeNull();
  });

  it('does not expose capture while signed out', () => {
    state.signedIn = false;
    const { container } = render(<FootfallPage />);
    expect(container.textContent).toBe('');
  });
});
