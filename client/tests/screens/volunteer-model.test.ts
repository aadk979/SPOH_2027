import { describe, expect, it } from 'vitest';
import type { CommitteeRole } from '@spoh/shared';
import { canActOn } from '@/features/volunteers/model/canActOn';
const roles: CommitteeRole[] = [
  'ADMIN',
  'LEAD',
  'CHIEF_COORDINATOR',
  'DEPUTY_COORDINATOR',
  'IC',
  'VOLUNTEER',
];
describe('roster management affordance', () => {
  it.each(roles)('denies an unknown viewer and peers for %s', (role) => {
    expect(canActOn(undefined, role)).toBe(false);
    expect(canActOn(role, role)).toBe(false);
  });
  it('allows only strictly lower-ranked targets', () => {
    roles.forEach((viewer, viewerIndex) => {
      roles.forEach((target, targetIndex) => {
        expect(canActOn(viewer, target), viewer + ' -> ' + target).toBe(viewerIndex < targetIndex);
      });
    });
  });
});
