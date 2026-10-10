import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { closeRehearsalWindows } from '../../fallback/index.js';
import { writeEventPhase, type LifecycleEvent } from '../data/lifecycleRepo.js';
import type { TransitionEvaluation } from '../domain/lifecycle.js';
import { closeEvent } from './closeEvent.js';
import { reopenEvent } from './reopenEvent.js';
import { archiveEvent } from './archiveEvent.js';

/** Only effects of an already allowed transition execute, in the owning transaction. */
export async function applyLifecycleEffects(
  tx: PrismaTransactionClient,
  input: { actor: ActorContext; event: LifecycleEvent; decision: TransitionEvaluation; now: Date },
) {
  const { actor, event, decision, now } = input;
  const closedWindows = decision.effects.includes('rehearsal.close')
    ? await closeRehearsalWindows(tx, actor.scope, now)
    : [];
  const row = await writeEventPhase(tx, actor.scope, {
    status: decision.to,
    ...(decision.to === 'CLOSED' ? { closedAt: now } : {}),
    ...(decision.effects.includes('close.reopen') ? { closedAt: null } : {}),
    ...(decision.effects.includes('archive.start') ? { archivedAt: now } : {}),
  });
  const closeOut =
    decision.to === 'CLOSED'
      ? await closeEvent(tx, {
          actor,
          organisationId: event.organisationId,
          version: row.lifecycleVersion,
          now,
        })
      : undefined;
  const reopen = decision.effects.includes('close.reopen')
    ? await reopenEvent(tx, actor.scope, now)
    : undefined;
  const archive = decision.effects.includes('archive.start')
    ? await archiveEvent(tx, { scope: actor.scope, now, audit: actor.audit })
    : undefined;
  return {
    row,
    closedWindows: closeOut?.closedWindows ?? closedWindows,
    closeOut,
    reopen,
    archive,
  };
}
