import type { Capability } from '@spoh/shared';

export const operationLinks: Array<{
  href: string;
  label: string;
  hint: string;
  capability: Capability;
  group: string;
}> = [
  {
    href: '/chief',
    label: 'Live operations',
    hint: 'Attendance, staffing and issues across the event.',
    capability: 'dashboard.event.read',
    group: 'Monitor',
  },
  {
    href: '/ic',
    label: 'IC console',
    hint: 'Your stations, team and shift requests.',
    capability: 'dashboard.station.read',
    group: 'Monitor',
  },
  {
    href: '/admin/users',
    label: 'Volunteers',
    hint: 'Manage the roster, roles and access.',
    capability: 'user.read',
    group: 'Manage',
  },
  {
    href: '/admin/settings',
    label: 'Event settings',
    hint: 'Configure shift times and event thresholds.',
    capability: 'config.manage',
    group: 'Manage',
  },
  {
    href: '/chief/fallback',
    label: 'Fallback',
    hint: 'Open or close a fallback window.',
    capability: 'fallback.declare',
    group: 'Recover & report',
  },
  {
    href: '/chief/imports',
    label: 'Import',
    hint: 'Reconcile data recorded during fallback.',
    capability: 'fallback.import',
    group: 'Recover & report',
  },
  {
    href: '/reports',
    label: 'Reports',
    hint: 'Prepare the post-event dataset.',
    capability: 'report.generate',
    group: 'Recover & report',
  },
];

export function canOpenOperations(capabilities: readonly Capability[]): boolean {
  return operationLinks.some((item) => capabilities.includes(item.capability));
}

export function sectionForPath(path: string): string {
  if (path === '/shift' || path === '/attendance') return '/shift';
  if (['/guide', '/map', '/journey', '/brief'].some((p) => path === p)) return '/guide';
  if (path === '/safety' || path.startsWith('/safety/')) return '/safety';
  if (
    ['/operations', '/chief', '/ic', '/admin', '/reports', '/tv'].some(
      (p) => path === p || path.startsWith(p + '/'),
    )
  )
    return '/operations';
  if (path === '/inbox') return '/inbox';
  if (path === '/capture' || path.startsWith('/capture/')) return '/capture';
  return '/home';
}
