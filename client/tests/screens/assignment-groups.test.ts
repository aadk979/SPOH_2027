import { describe, expect, it } from 'vitest';
import { assignmentGroups } from '@/features/shift/model/assignmentGroups';
import { MY_STAFFING_ASSIGNMENT } from '../helpers/staffing';

describe('shift hierarchy', () => {
  it('keeps every assignment and orders exact shifts within today/upcoming/past', () => {
    const rows = [
      { ...MY_STAFFING_ASSIGNMENT, id: 'future', date: '2027-01-09' },
      { ...MY_STAFFING_ASSIGNMENT, id: 'today-b', date: '2027-01-08' },
      { ...MY_STAFFING_ASSIGNMENT, id: 'past', date: '2027-01-07' },
      { ...MY_STAFFING_ASSIGNMENT, id: 'today-a', date: '2027-01-08' },
    ];
    const groups = assignmentGroups(rows, '2027-01-08');
    expect(groups.today.map((row) => row.id)).toEqual(['today-a', 'today-b']);
    expect(groups.upcoming.map((row) => row.id)).toEqual(['future']);
    expect(groups.past.map((row) => row.id)).toEqual(['past']);
    expect(rows[0]?.id).toBe('future');
  });
  it('returns truthful empty groups without inventing a shift', () => {
    expect(assignmentGroups([], '2027-01-08')).toEqual({ today: [], upcoming: [], past: [] });
  });
});
