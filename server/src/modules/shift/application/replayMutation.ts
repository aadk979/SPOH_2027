import { NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { systemClock } from '../../../platform/time/index.js';
import { findSlotById, findSwapById } from '../data/repo.js';
import { toBriefingSlotRecord, toSwapRecord } from '../data/mappers.js';
import { minutesUntilStart } from '../domain/briefingRules.js';

export async function replaySwap(id: string, actor: ActorContext) {
  const swap = await findSwapById(actor.scope, id);
  if (!swap) throw new NotFoundError('Swap request');
  return { swap: toSwapRecord(swap) };
}
export async function replayBriefing(id: string, actor: ActorContext) {
  const slot = await findSlotById(actor.scope, id);
  if (!slot) throw new NotFoundError('Briefing slot');
  return {
    slot: toBriefingSlotRecord(slot, {
      viewerId: actor.volunteerId,
      minutesUntilStart: minutesUntilStart(slot.startsAt, systemClock.now()),
    }),
  };
}
