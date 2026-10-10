import type { GoLiveCheckCode } from '@spoh/shared';
import { NAV_REGISTRY } from '@/navigation';

const ITEMS: Record<GoLiveCheckCode, { label: string; path: string; help: string }> = {
  'shift-coverage': {
    label: 'Every shift and station staffed',
    path: '/admin/users',
    help: 'Assign active event members to every shift and active station.',
  },
  categories: {
    label: 'Visitor categories defined',
    path: '/admin/settings',
    help: 'Keep at least one active visitor category.',
  },
  'card-batch': {
    label: 'Live card batch generated',
    path: '/admin/settings',
    help: 'Generate a labelled batch with unused live cards.',
  },
  'gift-stock': {
    label: 'Gifts stocked',
    path: '/admin/settings',
    help: 'Each active gift type needs positive live stock.',
  },
  content: {
    label: 'Content published',
    path: '/guide',
    help: 'Publish the required guide and map content.',
  },
  attendance: {
    label: 'Attendance configured',
    path: '/admin/settings',
    help: 'Choose an active admin root and set trusted venue networks.',
  },
  'role-permissions': {
    label: 'Role permissions reviewed',
    path: '/admin/permissions',
    help: 'Review the exact current permissions version.',
  },
  notifications: {
    label: 'Notifications configured',
    path: '/admin/settings',
    help: 'Check notification and alert refresh settings. Delivery is verified separately.',
  },
  'staging-smoke': {
    label: 'Staging smoke green',
    path: '/admin/settings',
    help: 'Requires a fresh smoke observation of the deployed release.',
  },
  backups: {
    label: 'Backups fresh',
    path: '/admin/settings',
    help: 'Requires a fresh restorable horizon for the selected database.',
  },
  alarms: {
    label: 'Alarms healthy',
    path: '/admin/settings',
    help: 'Requires current observations of every required alarm.',
  },
};

/** Destinations are resolved against the registry shared by every navigation surface. */
export function goLiveChecklistItem(code: GoLiveCheckCode) {
  const item = ITEMS[code];
  const entry = NAV_REGISTRY.find((candidate) => candidate.path === item.path);
  return {
    ...item,
    destination: entry?.label ?? 'Event settings',
    path: entry?.path ?? '/admin/settings',
  };
}
