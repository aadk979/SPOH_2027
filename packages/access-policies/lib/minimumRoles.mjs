/** Validates authored owner-approved floors before emitting permission-editor metadata. */
export const ROLE_RANKS = Object.freeze({
  VOLUNTEER: 10,
  IC: 20,
  DEPUTY_COORDINATOR: 30,
  CHIEF_COORDINATOR: 40,
  LEAD: 50,
  ADMIN: 60,
});

function object(value, description) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
}

function keys(value, expected, description) {
  object(value, description);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${description} must contain exactly: ${expected.join(', ')}`);
  }
}

/** No fallback floors: incomplete, contradictory or unapproved input aborts generation. */
export function minimumRoles(actions, defaults, decision) {
  keys(
    decision,
    ['$comment', 'approval', 'floors', 'ownerFloors', 'unresolved'],
    'Minimum-role decision',
  );
  keys(decision.approval, ['date', 'decision'], 'Minimum-role approval');
  if (
    decision.approval.date !== '2026-10-06' ||
    decision.approval.decision !== 'lowest-approved-default-role'
  ) {
    throw new Error('Minimum-role approval does not match the 6 October owner decision');
  }
  keys(defaults, ['$comment', ...Object.keys(ROLE_RANKS)], 'Default role catalogue');
  for (const [role, rank] of Object.entries(ROLE_RANKS)) {
    if (defaults[role]?.rank !== rank || !Array.isArray(defaults[role]?.grants)) {
      throw new Error(`Default role ${role} must retain its fixed rank ${rank} and grants`);
    }
  }
  object(decision.floors, 'Minimum-role floors');
  object(decision.ownerFloors, 'Owner-decided floors');
  for (const [id, floor] of Object.entries(decision.ownerFloors)) {
    keys(floor, ['role', 'decision', 'date'], `Owner-decided floor for ${id}`);
    if (!/^D-\d+ = [A-Z]$/.test(floor.decision) || !/^\d{4}-\d{2}-\d{2}$/.test(floor.date)) {
      throw new Error(`Owner-decided floor for ${id} must name its decision and date`);
    }
  }
  if (
    !Array.isArray(decision.unresolved) ||
    !decision.unresolved.every((action) => typeof action === 'string') ||
    new Set(decision.unresolved).size !== decision.unresolved.length
  ) {
    throw new Error('Unresolved minimum roles must be a unique list of action identifiers');
  }

  const editable = actions.filter(({ groups }) => groups.includes('Editable')).map(({ id }) => id);
  const supplied = [
    ...Object.keys(decision.floors),
    ...Object.keys(decision.ownerFloors),
    ...decision.unresolved,
  ];
  if (
    new Set(supplied).size !== supplied.length ||
    JSON.stringify([...supplied].sort()) !== JSON.stringify([...editable].sort())
  ) {
    throw new Error(
      'Minimum-role floors and unresolved actions must cover exactly Editable actions',
    );
  }

  return Object.fromEntries(
    actions.map(({ id, groups }) => {
      if (!groups.includes('Editable')) return [id, { status: 'locked' }];
      const defaultRoles = Object.keys(ROLE_RANKS).filter((role) =>
        defaults[role].grants.includes(id),
      );
      if (decision.unresolved.includes(id)) {
        if (defaultRoles.length !== 0) {
          throw new Error(`Unresolved action ${id} must have no approved default grant`);
        }
        return [id, { status: 'unresolved', reason: 'owner-decision-pending' }];
      }
      // A floor the owner decided for an action no role holds by default, so there is no
      // lowest default role to derive it from (D-15).
      if (Object.hasOwn(decision.ownerFloors, id)) {
        const { role } = decision.ownerFloors[id];
        if (!Object.hasOwn(ROLE_RANKS, role)) throw new Error(`Unknown minimum role for ${id}`);
        if (defaultRoles.length !== 0) {
          throw new Error(`Owner-decided floor for ${id} is only for an action without defaults`);
        }
        return [id, { status: 'approved', role, rank: ROLE_RANKS[role] }];
      }
      const role = decision.floors[id];
      if (!Object.hasOwn(ROLE_RANKS, role)) throw new Error(`Unknown minimum role for ${id}`);
      if (defaultRoles.length === 0 || role !== defaultRoles[0]) {
        throw new Error(`Minimum role for ${id} must match its lowest approved default role`);
      }
      return [id, { status: 'approved', role, rank: ROLE_RANKS[role] }];
    }),
  );
}
