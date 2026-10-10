import type { RolePermissionsResponse } from '@spoh/shared';

type Table = RolePermissionsResponse['data'];
type Row = Table['actions'][number];
type RoleColumn = Table['roles'][number];

/** The headings the screen groups actions under, in reading order. */
export const GROUP_ORDER = [
  'Capture',
  'Correct',
  'Safety',
  'Manage',
  'Configure',
  'Report',
  'Self',
] as const;
export type PermissionGroup = (typeof GROUP_ORDER)[number];

/** Editable and Write are properties, not headings; the first other group is the heading. */
export function groupOf(row: Row): PermissionGroup {
  const heading = row.groups.find((group): group is PermissionGroup =>
    (GROUP_ORDER as readonly string[]).includes(group),
  );
  return heading ?? 'Manage';
}

export function groupedRows(table: Table): { group: PermissionGroup; rows: Row[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    rows: table.actions.filter((row) => groupOf(row) === group),
  })).filter((section) => section.rows.length > 0);
}

export type CellState =
  /** The event grants it; an editor may revoke it. */
  | 'granted'
  /** Not granted; an editor may grant it. */
  | 'available'
  /** Below the action's minimum role: never grantable. */
  | 'below-minimum'
  /** Not a per-event grant: self-service, a guardrail or platform admins'. */
  | 'fixed';

export function cellState(row: Row, role: RoleColumn, table: Table): CellState {
  if (!row.editable || row.minimumRole === null) return 'fixed';
  const floor = table.roles.find((column) => column.role === row.minimumRole);
  if (floor && role.rank < floor.rank) return 'below-minimum';
  return role.grants.includes(row.action) ? 'granted' : 'available';
}

/** Whether this viewer may toggle the cell. */
export function canToggle(state: CellState, canEdit: boolean): boolean {
  return canEdit && (state === 'granted' || state === 'available');
}

/** An action label as a line of its own: "register visitors" → "Register visitors". */
export function asLine(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}
