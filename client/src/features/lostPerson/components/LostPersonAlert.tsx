import type { ReactNode } from 'react';
import type { LostPersonAlertRecord } from '@spoh/shared';
import type { useAcknowledgeAlert, useResolveAlert } from '@/features/lostPerson';
import { Button, ButtonLink } from '@/shared/ui';
/**
 * Button colours for the one red surface in the app.
 *
 * `--color-alert-solid` is the fixed deep red, so white on it clears 6.5:1 in
 * both themes. The kit's own variants cannot be used: they are drawn for a
 * light canvas or a dark tile, and this is neither.
 */
const SOLID =
  'border-transparent bg-on-alert text-alert-solid hover:bg-white/90 active:scale-[0.97] focus-visible:outline-white disabled:opacity-70';
const OUTLINE =
  'border-2 border-on-alert bg-transparent text-on-alert hover:bg-white/10 active:scale-[0.97] focus-visible:outline-white disabled:opacity-70';

export function LostPersonAlert({
  alert,
  acknowledge,
  resolve,
  canResolve,
}: {
  alert: LostPersonAlertRecord;
  acknowledge: ReturnType<typeof useAcknowledgeAlert>;
  resolve: ReturnType<typeof useResolveAlert>;
  canResolve: boolean;
}): ReactNode {
  return (
    <div className="border-b border-white/20 px-md py-md last:border-b-0">
      <div className="mx-auto flex max-w-reading flex-col gap-sm">
        <div className="flex items-start justify-between gap-sm">
          <p className="text-caption font-semibold tracking-[0.06em] uppercase">
            {/* Text, not colour, carries the meaning (remediation/standards/engineering-standards.md). */}
            Lost person — search now
          </p>
          <p className="shrink-0 text-caption text-white/90">{alert.ackCount} acknowledged</p>
        </div>

        <p className="text-lead font-semibold">{alert.descriptionText}</p>

        <dl className="grid grid-cols-[auto_1fr] gap-x-sm gap-y-xxs text-caption text-white/90">
          {alert.approxAge ? (
            <>
              <dt className="font-semibold">Approx. age</dt>
              <dd>{alert.approxAge}</dd>
            </>
          ) : null}
          {alert.clothingText ? (
            <>
              <dt className="font-semibold">Wearing</dt>
              <dd>{alert.clothingText}</dd>
            </>
          ) : null}
          {alert.lastSeenStationName ? (
            <>
              <dt className="font-semibold">Last seen</dt>
              <dd>{alert.lastSeenStationName}</dd>
            </>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-sm">
          {/*
                Calling still beats tapping. The reporter's number sits next to
                the acknowledge button so a searcher who finds the child can
                reach them without leaving the screen (docs/adr/ADR-007-code-architecture.md).
              */}
          {alert.raisedByPhone ? (
            <ButtonLink
              variant="unstyled"
              href={`tel:${alert.raisedByPhone.replace(/\s/g, '')}`}
              className={SOLID}
            >
              Call {alert.raisedByName}
            </ButtonLink>
          ) : null}

          <Button
            variant="unstyled"
            onClick={() => acknowledge.mutate(alert.id)}
            disabled={alert.ackedByMe || acknowledge.isPending}
            className={OUTLINE}
          >
            {alert.ackedByMe ? 'Acknowledged ✓' : 'Acknowledge'}
          </Button>

          {canResolve ? (
            <Button
              variant="unstyled"
              onClick={() => resolve.mutate({ alertId: alert.id, outcome: 'RESOLVED_FOUND' })}
              disabled={resolve.isPending}
              className={SOLID}
            >
              Found — clear this alert
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
