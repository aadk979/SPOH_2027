import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Action } from '@spoh/shared';
import {
  NAV_REGISTRY,
  canOpenOperations,
  globalEntries,
  hubLabel,
  hubLinks,
  operationGroups,
  sectionEntries,
  sectionForPath,
} from '@/navigation';

const APP = join(__dirname, '..', '..', 'src', 'app');

/**
 * Every route the app serves, from its page.tsx files, as the registry names
 * it: an event screen by its path inside the event (`/e/[event]/home` is
 * `/home`, ADR-001 §5).
 */
function appRoutes(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return appRoutes(path);
    if (name !== 'page.tsx') return [];
    const route = `/${relative(APP, dir).split(sep).join('/')}`.replace(/^\/e\/\[event\]/, '');
    return [route || '/'];
  });
}

const OPERATIONS_TOOLS: Action[] = [
  'Dashboard.ReadEvent',
  'Dashboard.ReadStation',
  'People.Read',
  'Settings.Read',
  'Fallback.Declare',
  'Fallback.Import',
  'Report.Generate',
];

describe('navigation registry', () => {
  it('has exactly one entry per app route, and no entry without a route', () => {
    const paths = NAV_REGISTRY.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect([...paths].sort()).toEqual(
      appRoutes()
        .map((route) => (route === '/' ? '/' : route))
        .sort(),
    );
  });

  it.each([
    ['/', '/home'],
    ['/sign-in', '/home'],
    ['/attendance', '/shift'],
    ['/brief', '/guide'],
    ['/map', '/guide'],
    ['/safety/lost-found/new', '/safety'],
    ['/admin/settings', '/operations'],
    ['/chief/imports', '/operations'],
    ['/tv', '/operations'],
    ['/inbox', '/inbox'],
    ['/capture/registration/group', '/capture'],
  ])('places %s in section %s', (path, section) => {
    expect(sectionForPath(path)).toBe(section);
  });

  it('gives every section link an icon and every operations tool a group and an action', () => {
    for (const entry of NAV_REGISTRY) {
      if (entry.surfaces?.includes('section')) expect(entry.icon).toBeTruthy();
      if (entry.surfaces?.includes('operations')) {
        expect(entry.group).toBeTruthy();
        expect(entry.requires).toBeTruthy();
      }
    }
  });

  it('offers Operations exactly when at least one tool is allowed', () => {
    const allows = (actions: readonly Action[]) => (action: Action) => actions.includes(action);
    const sections = (actions: Action[]) =>
      sectionEntries({ allows: allows(actions) }).map((entry) => entry.path);
    expect(sections([])).toEqual(['/home', '/shift', '/guide', '/safety']);
    for (const tool of OPERATIONS_TOOLS) {
      expect(canOpenOperations({ allows: allows([tool]) })).toBe(true);
      expect(sections([tool])).toContain('/operations');
      expect(
        operationGroups({ allows: allows([tool]) }).flatMap((group) => group.links),
      ).toHaveLength(
        NAV_REGISTRY.filter(
          (entry) => entry.requires === tool && entry.surfaces?.includes('operations'),
        ).length,
      );
    }
  });

  it('groups operations tools in their fixed order', () => {
    const groups = operationGroups({
      allows: (action: Action) => OPERATIONS_TOOLS.includes(action),
    });
    expect(groups.map((group) => group.group)).toEqual(['Monitor', 'Manage', 'Recover & report']);
    expect(groups.flatMap((group) => group.links.map((link) => link.href))).toEqual([
      '/chief',
      '/ic',
      '/admin/users',
      '/admin/permissions',
      '/admin/settings',
      '/chief/fallback',
      '/chief/imports',
      '/reports',
    ]);
  });

  it('lists hub screens under their hub, and names only hubs as parents', () => {
    expect(hubLinks('/guide').map((link) => link.href)).toEqual(['/map', '/journey', '/brief']);
    expect(hubLinks('/safety').map((link) => link.emphasis ?? null)).toEqual([
      null,
      'primary',
      null,
    ]);
    expect(hubLabel('/operations')).toBe('Operations');
    expect(hubLabel('/shift')).toBeNull();
  });

  it('keeps the inbox on the global bar with a short label for narrow phones', () => {
    expect(globalEntries().map((entry) => [entry.path, entry.label, entry.shortLabel])).toEqual([
      ['/devices', 'Your devices', 'Devices'],
      ['/inbox', 'Announcements', 'Inbox'],
    ]);
  });
});
