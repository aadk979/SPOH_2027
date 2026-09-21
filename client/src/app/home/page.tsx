'use client';

import { AppShell } from '@/components/AppShell';
import { ShiftCard, RoleTiles } from '@/components/ShiftOverview';
import { SyncIndicator } from '@/components/SyncIndicator';
import { WorkspaceIntro } from '@/components/WorkspaceIntro';
import { NavTile } from '@/components/NavTile';
import { Button, ButtonLink, Callout, Card, LoadingCards, Stack } from '@/components/ui';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { canOpenOperations } from '@/lib/navigation';

export default function HomePage() {
  const session = useRequireSession();
  const { data: me, isPending, isError, refetch } = useMe();
  if (!session) return null;

  return (
    <AppShell width="wide" title="Home" actions={<SyncIndicator />}>
      <Stack>
        <WorkspaceIntro
          eyebrow="SPOH 2027 · Volunteer workspace"
          title={`Hello, ${me?.volunteer.displayName ?? session.displayName}`}
        >
          Your shift, your next action, and the information you need along the way.
        </WorkspaceIntro>
        {isError ? (
          <Callout tone="alert" title="We couldn’t load your shift">
            Check your connection and try again. The guide and safety tools are still available.
            <Button variant="secondary" className="mt-sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </Callout>
        ) : isPending || !me ? (
          <LoadingCards count={2} label="Loading your shift" />
        ) : (
          <div className="home-focus">
            <div className="flex flex-col gap-lg">
              <ShiftCard me={me} />
              <RoleTiles me={me} />
            </div>
            <Card className="home-companion">
              <p className="text-caption font-semibold text-primary uppercase tracking-[0.08em]">
                Before you begin
              </p>
              <h2 className="mt-sm text-title">
                A little preparation.
                <br />A smoother shift.
              </h2>
              <p className="mt-sm text-text-muted">
                Find your station, learn the visitor journey and get familiar with your briefing.
              </p>
              <ButtonLink href="/guide" variant="secondary" className="mt-md">
                Open the event guide <span aria-hidden="true">→</span>
              </ButtonLink>
              <div className="mt-lg border-t border-line pt-md">
                <p className="text-caption text-text-muted">
                  Need a hand? Your safety tools and team contacts are together in Safety.
                </p>
                <ButtonLink href="/safety" variant="quiet" size="sm" className="mt-xs">
                  Get help
                </ButtonLink>
              </div>
            </Card>
          </div>
        )}
        <div className="grid gap-sm sm:grid-cols-2">
          <NavTile
            href="/shift"
            label="Plan your shift"
            hint="View your assignments, alerts and sync status."
          />
          {canOpenOperations(session.capabilities) ? (
            <NavTile
              href="/operations"
              label="Open operations"
              hint="Monitor the event and manage your team."
            />
          ) : (
            <NavTile
              href="/inbox"
              label="Read announcements"
              hint="Stay up to date with messages for your team."
            />
          )}
        </div>
      </Stack>
    </AppShell>
  );
}
