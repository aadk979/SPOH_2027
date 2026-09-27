import { ERROR_CODES, outranks, type CommitteeRole } from '@spoh/shared';
import { AppError, ConflictError } from '../../../platform/errors/index.js';

/**
 * The guardrails on changing people (P06.4; F03-001 applies the same rules to
 * the roster import).
 *
 * An administrator cannot edit their own role or deactivate themselves. Not
 * paternalism: a Chief who demotes themselves by mistake at 09:00 on 7 January
 * has locked the only account that can undo it.
 *
 * An administrator cannot grant a role at or above their own, or act on
 * someone who already holds one. Otherwise `user.provision` is not a
 * permission to manage volunteers, it is a permission to become an Admin.
 */

export { outranks };

/** Whether `actor` may change `target` at all: not themselves, and only people below them. */
export function assertMayActOn(
  actor: { volunteerId: string; role: CommitteeRole },
  target: { id: string; role: CommitteeRole },
  action: string,
): void {
  if (target.id === actor.volunteerId) {
    throw new AppError(
      403,
      ERROR_CODES.SELF_MUTATION_DENIED,
      `You cannot ${action} your own account. Ask another administrator.`,
    );
  }
  if (!outranks(actor.role, target.role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot change an account at or above your own level.',
    );
  }
}

export function assertMayGrant(actorRole: CommitteeRole, role: CommitteeRole | undefined): void {
  if (role && !outranks(actorRole, role)) {
    throw new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot grant a role at or above your own.',
    );
  }
}

export function assertActive(target: { active: boolean }, active: boolean): void {
  if (target.active !== active) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      active ? 'That account is already deactivated' : 'That account is already active',
    );
  }
}

/**
 * Walk the reporting chain to make sure a proposed manager is not downstream
 * of the volunteer being edited. A cycle is not cosmetic: `GET /me` walks this
 * chain to build the escalation card, and a loop would spin until the request
 * timed out, on the boot call every volunteer makes.
 */
export async function assertNoReportingCycle(
  chain: { volunteerId: string; managerId: string },
  managerOf: (id: string) => Promise<string | null>,
): Promise<void> {
  if (chain.volunteerId === chain.managerId) {
    throw new AppError(409, ERROR_CODES.REPORTING_CYCLE, 'Somebody cannot report to themselves.');
  }
  const seen = new Set<string>([chain.volunteerId]);
  // Bounded by the roster size; the seen-set makes it terminate on any
  // pre-existing loop rather than inheriting it.
  for (let cursor: string | null = chain.managerId; cursor; cursor = await managerOf(cursor)) {
    if (seen.has(cursor)) {
      throw new AppError(
        409,
        ERROR_CODES.REPORTING_CYCLE,
        'That reporting line would form a loop.',
      );
    }
    seen.add(cursor);
  }
}
