import type { NavEntry } from './types';

export const WORKSPACE_ENTRIES: readonly NavEntry[] = [
  { path: '/notifications', label: 'Notifications', shortLabel: 'Alerts', section: '/inbox', surfaces: ['global'] },
  { path: '/search', label: 'Search this event', section: '/home' },
  { path: '/entity', label: 'Record detail', section: '/home' },
  { path: '/records', label: 'Filtered records', section: '/operations' },
  { path: '/help', label: 'Help and count glossary', section: '/guide', surfaces: ['hub'],
    hint: 'Understand counts, sources, offline capture and corrections.' },
];
