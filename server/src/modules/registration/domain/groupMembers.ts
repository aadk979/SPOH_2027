import type { VisitorCategory } from '@spoh/shared';

/** A group registration's members as the booth entered them: a count per category. */
export interface GroupMembers {
  idempotencyKey: string;
  members: Array<{ category: VisitorCategory; count: number }>;
}

/** What every row of one group shares. */
export interface GroupRowContext {
  stationId: string;
  recordedById: string;
  groupId: string;
  missionCardId: string | null;
  recordedAt: Date;
  clientRecordedAt: Date | null;
}

/**
 * One row per person, expanded from the counts the booth entered: a family of
 * four is four registrations. The idempotency key is suffixed per row because
 * the column is unique and the whole group shares one client-generated key.
 */
export function expandGroupMembers(group: GroupMembers, context: GroupRowContext) {
  return group.members.flatMap((member) =>
    Array.from({ length: member.count }, (_unused, index) => ({
      ...context,
      category: member.category,
      idempotencyKey: `${group.idempotencyKey}:${member.category}:${index}`,
      source: 'APP' as const,
    })),
  );
}
