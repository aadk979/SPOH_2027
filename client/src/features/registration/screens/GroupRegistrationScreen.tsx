'use client';

import { useGroupRegistration } from '../hooks/useGroupRegistration';
import { CategorySteppers } from '../components/CategorySteppers';
import { GroupSubmitForm } from '../components/GroupSubmitForm';

import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { EmptyState } from '@/shared/ui';
import { useRequireSession } from '@/features/session';

/**
 * Group registration (remediation/phases/P07-client-refactor.md).
 *
 * A family of four arriving together is four humans and one Mission Card. This
 * screen writes four registration records and links one card, which is how the
 * family-of-four problem gets handled honestly rather than fudged into
 * whichever number happens to look better.
 *
 * Unlike the single-tap screen this one does have a confirm step — the
 * volunteer is building a composition, not recording an event, and getting it
 * wrong costs four rows rather than one.
 */

export default function GroupRegistrationScreen(): ReactNode {
  const session = useRequireSession();
  const form = useGroupRegistration();
  const { stationId } = form;

  if (!session) return null;

  if (!stationId) {
    return (
      <AppShell title="Group" back={{ href: '/capture/registration', label: 'Registration' }}>
        <EmptyState title="Not on shift at the sign-up booth">
          Group registrations cannot be recorded from this device right now.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell
      width="capture"
      title="A group arriving together"
      back={{ href: '/capture/registration', label: 'Registration' }}
    >
      <div className="flex flex-col gap-lg">
        <p className="text-text-muted">
          Build the group, then confirm. Everyone is counted; the group shares one Mission Card.
        </p>

        <CategorySteppers form={form} />

        <GroupSubmitForm form={form} />
      </div>
    </AppShell>
  );
}
