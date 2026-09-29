import {
  NAV_REGISTRY,
  isVisible,
  type NavContext,
  type NavEntry,
  type NavSurface,
  type OperationsGroup,
  type SectionPath,
} from './registry';

/** A tile or link, in the shape `NavTile` takes. */
export interface NavLink {
  href: string;
  label: string;
  hint: string;
  emphasis?: 'primary';
}

function onSurface(surface: NavSurface): NavEntry[] {
  return NAV_REGISTRY.filter((entry) => entry.surfaces?.includes(surface));
}

function toLink(entry: NavEntry, context?: NavContext): NavLink {
  const station = context?.station;
  const hint = station && entry.stationHint ? entry.stationHint(station) : entry.hint;
  return {
    href: entry.path,
    label: entry.label,
    hint: hint ?? '',
    ...(entry.emphasis ? { emphasis: entry.emphasis } : {}),
  };
}

function covers(entry: NavEntry, path: string): boolean {
  return path === entry.path || (entry.path !== '/' && path.startsWith(`${entry.path}/`));
}

/** The section a path belongs to: its own entry, or its nearest registered parent. */
export function sectionForPath(path: string): SectionPath {
  const owners = NAV_REGISTRY.filter((entry) => covers(entry, path));
  const nearest = owners.sort((a, b) => b.path.length - a.path.length)[0];
  return nearest?.section ?? '/home';
}

/** The main sections, in order, that this viewer may open. */
export function sectionEntries(context: NavContext): NavEntry[] {
  return onSurface('section').filter((entry) => isVisible(entry, context));
}

/** The label of a hub section, for a screen that names it as its parent. */
export function hubLabel(section: SectionPath): string | null {
  return NAV_REGISTRY.find((entry) => entry.hub && entry.path === section)?.label ?? null;
}

/** Links on the global bar, which every signed-in screen shows. */
export function globalEntries(): NavEntry[] {
  return onSurface('global');
}

/** The operations tools this viewer may use, by group, in registry order. */
export function operationGroups(
  context: NavContext,
): Array<{ group: OperationsGroup; links: NavLink[] }> {
  const visible = onSurface('operations').filter((entry) => isVisible(entry, context));
  const groups = [...new Set(visible.map((entry) => entry.group))].filter(
    (group): group is OperationsGroup => group !== undefined,
  );
  return groups.map((group) => ({
    group,
    links: visible.filter((entry) => entry.group === group).map((entry) => toLink(entry)),
  }));
}

/** Capture tiles the viewer's role allows, at a station that actually does that work. */
export function stationLinks(context: NavContext): NavLink[] {
  if (!context.station) return [];
  return onSurface('station')
    .filter((entry) => isVisible(entry, context))
    .map((entry) => toLink(entry, context));
}

/** The screens a hub page (the guide, safety) lists. */
export function hubLinks(section: SectionPath): NavLink[] {
  return onSurface('hub')
    .filter((entry) => entry.section === section)
    .map((entry) => toLink(entry));
}
