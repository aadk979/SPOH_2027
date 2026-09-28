'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Callout, Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { useFallbackScreen } from '../hooks/useFallbackScreen';
import { OpenFallbackWindows } from '../components/OpenFallbackWindows';
import { ClosedFallbackWindows } from '../components/ClosedFallbackWindows';
import { DeclareFallbackForm } from '../components/DeclareFallbackForm';

/**
 * Declaring and closing a fallback window (ADR-007 §1; remediation P07.5).
 *
 * This is a command decision, not a volunteer one — the screen exists only for
 * a Deputy Coordinator or the Chief, and it says so. Individual volunteers
 * switching systems on their own is how the same visitor ends up counted in
 * three places.
 *
 * Declaring here does NOT switch anything over. It records that operation was
 * degraded, so every report covering that period says so. The actual switch is
 * a human announcement in the Safety Communications Chat, and the screen
 * reminds whoever is declaring.
 */
export default function FallbackScreen(): ReactNode {
  const session = useRequireSession();

  const controller = useFallbackScreen(session !== null);
  const { windows } = controller;

  if (!session) return null;

  const open = (windows.data ?? []).filter((window) => window.open);
  const closed = (windows.data ?? []).filter((window) => !window.open);

  return (
    <AppShell width="wide" title="Fallback" back={{ href: '/chief', label: 'Live operations' }}>
      <Stack>
        {open.length > 0 ? <OpenFallbackWindows open={open} close={controller.close} /> : null}

        <DeclareFallbackForm controller={controller} />

        {closed.length > 0 ? (
          <ClosedFallbackWindows closed={closed} />
        ) : (
          <Callout tone="ok">No fallback window has been declared. Data is complete.</Callout>
        )}
      </Stack>
    </AppShell>
  );
}
