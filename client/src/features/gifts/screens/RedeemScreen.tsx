'use client';

import { type ReactNode } from 'react';

import { AppShell } from '@/shared/shell/AppShell';
import { CardCodeInput } from '@/features/capture';
import { Button, Callout, EmptyState, Section } from '@/shared/ui';
import { GiftPicker } from '../components/GiftPicker';
import { useRedemption } from '../hooks/useRedemption';
import { useRequireSession } from '@/features/session';

/**
 * Gift redemption (remediation/phases/P07-client-refactor.md).
 *
 * The physical stamped card authorises the gift; the scan is a cross-check.
 * A card that will not scan must never stop a visitor who has walked the whole
 * journey — so the code is optional here, and every soft problem is a warning
 * the volunteer can override rather than a wall.
 *
 * Out of stock is the one hard stop, and it renders as an explicit state rather
 * than a silent failure.
 */
export default function RedeemScreen(): ReactNode {
  const session = useRequireSession();
  const redemption = useRedemption(session !== null);
  const { station, selected, message, pending, redeem, scanner } = redemption;

  if (!session) return null;

  if (!station) {
    return (
      <AppShell width="capture" title="Redeem a gift" back={{ href: '/home', label: 'Home' }}>
        <EmptyState title="Redemption is closed">
          You are not on shift right now, so gifts cannot be redeemed from this device.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell width="capture" title="Redeem a gift" back={{ href: '/home', label: 'Home' }}>
      <div className="flex flex-col gap-lg">
        <p className="text-caption text-text-muted">
          Check the stamps on the physical card first. The scan is a cross-check, not a gate.
        </p>

        <GiftPicker redemption={redemption} />

        {selected ? (
          <Section title="Scan the card, or hand it over without one">
            <div className="flex flex-col gap-md">
              <CardCodeInput
                videoRef={scanner.videoRef}
                scannerState={scanner.state}
                onSubmitCode={(code) => void redeem(code)}
                pending={pending}
              />

              <Button
                variant="quiet"
                size="lg"
                block
                disabled={pending}
                onClick={() => void redeem()}
              >
                Redeem without a card code
              </Button>
            </div>
          </Section>
        ) : (
          <p className="text-text-muted">Pick a gift to continue.</p>
        )}

        {message ? (
          <Callout tone={message.tone} role="status">
            <span className="font-semibold">{message.text}</span>
          </Callout>
        ) : null}
      </div>
    </AppShell>
  );
}
