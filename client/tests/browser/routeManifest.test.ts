import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EntityKind, RecordsKind } from '@spoh/shared';
import { NAV_REGISTRY } from '@/navigation';
import { BROWSER_PROJECTS, CAMPAIGN_ROUTES, WORKSPACE_ENTITY_CASES, WORKSPACE_RECORD_CASES } from './routeManifest';
const APP = join(__dirname, '../../src/app');
function compositionRoutes(directory = APP): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return compositionRoutes(file);
    return entry.name === 'page.tsx' ? [(`/${relative(APP, directory).split(sep).join('/')}`).replace(/^\/e\/\[event\]/, '') || '/'] : [];
  });
}
describe('P14 full browser inventory', () => {
  it('has all 57 actual composition pages and registry destinations exactly once', () => {
    const paths = CAMPAIGN_ROUTES.map((route) => route.path).sort();
    expect(paths).toHaveLength(57); expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(compositionRoutes().sort());
    expect(paths).toEqual(NAV_REGISTRY.map((route) => route.path).sort());
    expect(CAMPAIGN_ROUTES.every((route) => !!route.heading && !!route.fixture)).toBe(true);
  });
  it('independently covers every entity/filter kind and all four phone/laptop/light/dark projects', () => {
    expect([...WORKSPACE_ENTITY_CASES].sort()).toEqual([...EntityKind.options].sort());
    expect([...WORKSPACE_RECORD_CASES].sort()).toEqual([...RecordsKind.options].sort());
    expect(BROWSER_PROJECTS.map((project) => project.name)).toEqual(['phone-light', 'phone-dark', 'laptop-light', 'laptop-dark']);
  });
});
