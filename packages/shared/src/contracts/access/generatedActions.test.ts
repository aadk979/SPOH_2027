import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTION_CATALOGUE,
  ACTION_GROUPS,
  ACTION_IDS,
  EDITABLE_ACTION_IDS,
  WRITE_ACTION_IDS,
  type ActionGroup,
} from '../../index.js';

describe('generated actions on the shared public surface', () => {
  it('exports every named action from the accepted schema exactly once', () => {
    const schema = readFileSync(
      new URL('../../../../access-policies/schema.cedarschema', import.meta.url),
      'utf8',
    );
    // Read declaration names only; Cedar execution belongs to the policy package.
    const names = [...schema.matchAll(/^\s*action\s+((?:"[^"]+"(?:\s*,\s*)?)+)/gm)].flatMap(
      ([, declaration]) => [...declaration!.matchAll(/"([^"]+)"/g)].map((match) => match[1]!),
    );
    expect(names).toHaveLength(66);
    expect(new Set(names).size).toBe(66);
    expect(ACTION_IDS).toHaveLength(66);
    expect(new Set(ACTION_IDS).size).toBe(66);
    expect([...ACTION_IDS].sort()).toEqual(names.sort());
    expect(Object.keys(ACTION_CATALOGUE).sort()).toEqual([...ACTION_IDS].sort());
  });

  it('keeps the editable and write exports consistent with every action metadata entry', () => {
    expect(ACTION_GROUPS).toEqual([
      'Capture',
      'Correct',
      'Safety',
      'Self',
      'Report',
      'Manage',
      'Configure',
      'Platform',
      'Editable',
      'Write',
    ]);
    expect(new Set(ACTION_GROUPS).size).toBe(ACTION_GROUPS.length);
    expect(EDITABLE_ACTION_IDS).toHaveLength(47);
    for (const [group, exported] of [
      ['Editable', EDITABLE_ACTION_IDS],
      ['Write', WRITE_ACTION_IDS],
    ] as const) {
      expect(new Set(exported).size).toBe(exported.length);
      expect(exported).toEqual(
        ACTION_IDS.filter((id) => {
          const groups: readonly ActionGroup[] = ACTION_CATALOGUE[id].groups;
          return groups.includes(group);
        }),
      );
    }
    for (const metadata of Object.values(ACTION_CATALOGUE)) {
      expect(metadata.principalTypes.length).toBeGreaterThan(0);
      expect(metadata.resourceTypes.length).toBeGreaterThan(0);
      for (const group of metadata.groups) expect(ACTION_GROUPS).toContain(group);
    }
  });

  it.each([
    ['Registration.Create', ['Capture', 'Editable', 'Write'], ['Membership'], ['Station']],
    [
      'Record.Void',
      ['Correct', 'Editable', 'Write'],
      ['Membership'],
      ['FootfallTick', 'GiftRedemption', 'Registration'],
    ],
    ['Settings.ManageSecurity', ['Configure', 'Write'], ['Membership', 'Person'], ['Setting']],
    ['Permissions.Edit', ['Configure', 'Write'], ['Membership', 'Person'], ['Event']],
    ['Event.Reopen', ['Configure', 'Write'], ['Membership', 'Person'], ['Event']],
    ['Event.Archive', ['Configure', 'Write'], ['Membership', 'Person'], ['Event']],
    ['Self.Read', ['Self'], ['Membership'], ['Membership']],
    ['Attendance.IssueCode', ['Self', 'Write'], ['Membership'], ['EventDay']],
    ['Platform.CreateEvent', ['Platform', 'Write'], ['Person'], ['Organisation']],
    ['Platform.AdministerEvent', ['Platform'], ['Person'], ['Event']],
  ] as const)(
    'preserves the approved public metadata for %s',
    (id, groups, principalTypes, resourceTypes) => {
      expect(ACTION_CATALOGUE[id]).toMatchObject({ groups, principalTypes, resourceTypes });
      expect(new Set<string>(EDITABLE_ACTION_IDS).has(id)).toBe(
        groups.some((group) => group === 'Editable'),
      );
      expect(new Set<string>(WRITE_ACTION_IDS).has(id)).toBe(
        groups.some((group) => group === 'Write'),
      );
    },
  );
});
