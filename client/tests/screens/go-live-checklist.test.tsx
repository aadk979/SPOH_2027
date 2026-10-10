import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { GoLiveCheckCode } from '@spoh/shared';
import { GoLiveChecklist } from '@/features/events/components/GoLiveChecklist';
import { goLiveChecklistItem } from '@/features/events/model/goLiveChecklist';
import { NAV_REGISTRY } from '@/navigation';

afterEach(cleanup);
it('shows server pass, known failure and unavailable evidence separately with repair links', () => {
  render(
    <GoLiveChecklist
      items={[
        { code: 'categories', state: 'passed', passed: true, reasons: [] },
        {
          code: 'role-permissions',
          state: 'failed',
          passed: false,
          reasons: ['role-permissions-unreviewed'],
        },
        { code: 'backups', state: 'unavailable', passed: false, reasons: ['evidence-unavailable'] },
      ]}
    />,
  );
  expect(screen.getByText('Visitor categories defined: Passed')).toBeTruthy();
  expect(screen.getByText('Role permissions reviewed: Needs attention')).toBeTruthy();
  expect(screen.getByText('Backups fresh: Evidence unavailable')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Visitor categories/ })).toBeNull();
  expect(
    screen.getByRole('link', { name: /Role permissions reviewed/ }).getAttribute('href'),
  ).toContain('/admin/permissions');
});
it('resolves every item to an actual navigation destination', () => {
  for (const code of GoLiveCheckCode.options)
    expect(NAV_REGISTRY.some((entry) => entry.path === goLiveChecklistItem(code).path)).toBe(true);
});
