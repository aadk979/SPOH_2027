import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MeResponse, StationDashboardResponse } from '@spoh/shared';
import { StationRoster } from '@/features/dashboard/components/StationRoster';
import { defaultStationId } from '@/features/dashboard/model/defaultStation';

afterEach(cleanup);

const row = (block: 'MORNING' | 'AFTERNOON', assignmentId: string) => ({
  assignmentId,
  block,
  volunteerId: 'v1',
  volunteerName: 'Bea Booth',
  roleLabel: 'Helper',
  checkedInAt: null,
  checkedOutAt: null,
});

describe('IC console (F02-011)', () => {
  it('lists a person rostered in both blocks once per block, told apart by the hours', () => {
    const board = {
      roster: [row('MORNING', 'a1'), row('AFTERNOON', 'a2')],
    } as unknown as StationDashboardResponse;
    render(<StationRoster board={board} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('09:30–14:00');
    expect(items[1]!.textContent).toContain('13:30–18:00');
  });

  it('opens on the IC’s current station, else the next one they are rostered on', () => {
    const station = (id: string) => ({ station: { id } });
    const me = (current: string | null, upcoming: string[]) =>
      ({
        currentAssignment: current ? station(current) : null,
        upcomingAssignments: upcoming.map(station),
      }) as unknown as MeResponse;
    expect(defaultStationId(me('now', ['next']))).toBe('now');
    expect(defaultStationId(me(null, ['next', 'later']))).toBe('next');
    expect(defaultStationId(me(null, []))).toBeUndefined();
    expect(defaultStationId(undefined)).toBeUndefined();
  });
});
