import type { NavContext, NavEntry, OperationsGroup } from './types';
export type {
  NavContext,
  NavEntry,
  NavStation,
  NavSurface,
  OperationsGroup,
  SectionPath,
} from './types';

/**
 * The navigation registry (ADR-007 §1): the one source for every nav surface.
 *
 * Every screen is one entry. The section nav, the global bar, the operations
 * tiles, the station tiles, the guide and safety hubs and the "which section am
 * I in" highlight are all read from here, so they cannot disagree. Visibility
 * is by action (`requires`) plus an optional predicate on the viewer's station.
 */

const MONITOR: OperationsGroup = 'Monitor';
const MANAGE: OperationsGroup = 'Manage';
const RECOVER: OperationsGroup = 'Recover & report';

export const NAV_REGISTRY: readonly NavEntry[] = [
  { path: '/', label: 'Start', section: '/home' },
  { path: '/sign-in', label: 'Sign in', section: '/home' },
  { path: '/mfa', label: 'Protect your sign-in', section: '/home' },
  {
    path: '/admin/users/person',
    label: 'Person',
    section: '/operations',
    requires: 'Platform.ManageAdmins',
  },
  { path: '/events', label: 'Your events', section: '/home' },
  {
    path: '/overview',
    label: 'Overview',
    section: '/operations',
    surfaces: ['workspace'],
    workspaceOrder: 1,
    requires: 'Settings.Read',
  },
  {
    path: '/setup',
    label: 'Setup',
    section: '/operations',
    surfaces: ['workspace'],
    workspaceOrder: 2,
    requires: 'Settings.Read',
  },
  {
    path: '/home',
    label: 'Home',
    section: '/home',
    surfaces: ['section'],
    icon: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  },
  {
    path: '/shift',
    label: 'My shift',
    section: '/shift',
    surfaces: ['section'],
    icon: 'M5 5h14v16H5ZM8 2v6m8-6v6M5 11h14',
  },
  { path: '/attendance', label: 'Attendance', section: '/shift' },
  {
    path: '/devices',
    label: 'Your devices',
    shortLabel: 'Devices',
    section: '/home',
    surfaces: ['global'],
    requires: 'Self.Read',
  },
  {
    path: '/guide',
    label: 'Guide',
    section: '/guide',
    surfaces: ['section'],
    hub: true,
    icon: 'M12 5v16M12 5C8 2 4 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-2-1-6-2-10 1Z',
  },
  {
    path: '/map',
    label: 'Floor map',
    hint: 'Find stations, toilets, AEDs and exits.',
    section: '/guide',
    surfaces: ['hub'],
  },
  {
    path: '/journey',
    label: 'Visitor journey',
    hint: 'Follow the six steps from arrival to Mission Complete.',
    section: '/guide',
    surfaces: ['hub'],
  },
  {
    path: '/brief',
    label: 'What do I say',
    hint: 'Your briefing, course one-liners and visitor questions.',
    section: '/guide',
    surfaces: ['hub'],
  },
  {
    path: '/safety',
    label: 'Safety',
    section: '/safety',
    surfaces: ['section'],
    hub: true,
    icon: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM12 7v6m0 3v1',
  },
  {
    path: '/safety/incident/new',
    label: 'Report an incident',
    hint: 'Record an injury, near-miss or hazard.',
    section: '/safety',
    surfaces: ['hub'],
  },
  {
    path: '/safety/lost-person/new',
    label: 'Report a lost person',
    hint: 'Raise an alert so the team can help.',
    section: '/safety',
    surfaces: ['hub'],
    emphasis: 'primary',
  },
  {
    path: '/safety/lost-found',
    label: 'Lost and found',
    hint: 'Search for an item or log something handed in.',
    section: '/safety',
    surfaces: ['hub'],
  },
  { path: '/safety/lost-found/new', label: 'Log a found item', section: '/safety' },
  {
    path: '/operations',
    label: 'Operations',
    section: '/operations',
    surfaces: ['section', 'workspace'],
    workspaceOrder: 4,
    hub: true,
    icon: 'M4 21V11h4v10m2 0V3h4v18m2 0V7h4v14',
    visible: (context) => canOpenOperations(context),
  },
  {
    path: '/chief',
    label: 'Live operations',
    hint: 'Attendance, staffing and issues across the event.',
    section: '/operations',
    surfaces: ['operations'],
    group: MONITOR,
    requires: 'Dashboard.ReadEvent',
  },
  {
    path: '/ic',
    label: 'IC console',
    hint: 'Your stations, team and shift requests.',
    section: '/operations',
    surfaces: ['operations'],
    group: MONITOR,
    requires: 'Dashboard.ReadStation',
  },
  {
    path: '/admin/users',
    label: 'Volunteers',
    workspaceLabel: 'People',
    workspaceOrder: 3,
    hint: 'Manage the roster, roles and access.',
    section: '/operations',
    surfaces: ['operations', 'workspace', 'setup'],
    group: MANAGE,
    requires: 'People.Read',
  },
  {
    path: '/admin/permissions',
    label: 'Role permissions',
    workspaceLabel: 'Permissions',
    workspaceOrder: 8,
    hint: 'What each role can do, and why a request is refused.',
    section: '/operations',
    surfaces: ['operations', 'workspace', 'setup'],
    group: MANAGE,
    requires: 'Settings.Read',
  },
  {
    path: '/admin/users/invite',
    label: 'Invite people',
    section: '/operations',
    requires: 'People.Invite',
  },
  {
    path: '/admin/settings',
    label: 'Event settings',
    workspaceLabel: 'Settings',
    workspaceOrder: 6,
    hint: 'Configure shift times and event thresholds.',
    section: '/operations',
    surfaces: ['operations', 'workspace', 'setup'],
    group: MANAGE,
    requires: 'Settings.Read',
  },
  {
    path: '/chief/fallback',
    label: 'Fallback',
    hint: 'Open or close a fallback window.',
    section: '/operations',
    surfaces: ['operations'],
    group: RECOVER,
    requires: 'Fallback.Declare',
  },
  {
    path: '/chief/imports',
    label: 'Import',
    hint: 'Reconcile data recorded during fallback.',
    section: '/operations',
    surfaces: ['operations'],
    group: RECOVER,
    requires: 'Fallback.Import',
  },
  {
    path: '/reports',
    label: 'Reports',
    hint: 'Prepare the post-event dataset.',
    section: '/operations',
    surfaces: ['operations', 'workspace'],
    workspaceOrder: 5,
    group: RECOVER,
    requires: 'Report.Generate',
  },
  { path: '/tv', label: 'Ops-room display', section: '/operations' },
  {
    path: '/admin/content',
    label: 'Content',
    hint: 'Prepare and publish the guide, visitor journey and floor plans.',
    section: '/operations',
    surfaces: ['setup'],
    requires: 'Settings.Read',
  },
  {
    path: '/admin/schedule',
    label: 'Schedule',
    section: '/operations',
    surfaces: ['workspace'],
    workspaceOrder: 7,
    requires: 'Schedule.Manage',
  },
  {
    path: '/inbox',
    label: 'Announcements',
    shortLabel: 'Inbox',
    section: '/inbox',
    surfaces: ['global'],
  },
  {
    path: '/capture/registration',
    label: 'Register a visitor',
    hint: 'One tap per person',
    section: '/capture',
    surfaces: ['station'],
    requires: 'Registration.Create',
    visible: ({ station }) => station?.type.registersVisitors === true,
  },
  { path: '/capture/registration/group', label: 'Register a group', section: '/capture' },
  {
    path: '/capture/footfall',
    label: 'Count entries',
    section: '/capture',
    surfaces: ['station'],
    requires: 'Footfall.Create',
    visible: ({ station }) => station?.type.countsEntry === true,
    stationHint: (station) => station.name,
  },
  {
    path: '/capture/stamp',
    label: 'Stamp a card',
    hint: 'Scan after stamping by hand',
    section: '/capture',
    surfaces: ['station'],
    requires: 'Card.Stamp',
    visible: ({ station }) => station?.type.issuesStamp === true,
  },
  {
    path: '/capture/redeem',
    label: 'Redeem a gift',
    hint: 'Check the physical stamps first',
    section: '/capture',
    surfaces: ['station'],
    requires: 'Gift.Redeem',
    visible: ({ station }) => station?.type.redeemsGifts === true,
  },
];

/** Whether an entry is offered to this viewer. */
export function isVisible(entry: NavEntry, context: NavContext): boolean {
  if (entry.requires && !context.allows(entry.requires)) return false;
  return entry.visible ? entry.visible(context) : true;
}

/** Operations opens for anyone allowed at least one of its tools. */
export function canOpenOperations(context: NavContext): boolean {
  return NAV_REGISTRY.some(
    (entry) => entry.surfaces?.includes('operations') && isVisible(entry, context),
  );
}
