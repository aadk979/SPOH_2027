'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { VisitorCategory } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { enqueue } from '@/lib/outbox';

/**
 * Group registration (PRODUCT_BRIEF §2.2).
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

const CATEGORIES: Array<{ value: VisitorCategory; label: string }> = [
  { value: 'SEC_1', label: 'Sec 1' },
  { value: 'SEC_2', label: 'Sec 2' },
  { value: 'SEC_3', label: 'Sec 3' },
  { value: 'SEC_4', label: 'Sec 4' },
  { value: 'SEC_5', label: 'Sec 5' },
  { value: 'GRADUATED_AWAITING_RESULTS', label: 'Graduated' },
  { value: 'PARENT_GUARDIAN', label: 'Parent / Guardian' },
  { value: 'OTHER', label: 'Other' },
];

export default function GroupRegistrationPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();
  const [counts, setCounts] = useState<Partial<Record<VisitorCategory, number>>>({});
  const [shortCode, setShortCode] = useState('');
  const [saving, setSaving] = useState(false);

  const stationId = me?.currentAssignment?.station.id;
  const total = Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0);

  function adjust(category: VisitorCategory, delta: number): void {
    setCounts((current) => {
      const next = Math.max(0, (current[category] ?? 0) + delta);
      const updated = { ...current, [category]: next };
      if (next === 0) delete updated[category];
      return updated;
    });
  }

  async function submit(): Promise<void> {
    if (!stationId || total === 0) return;
    setSaving(true);

    const members = Object.entries(counts)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([category, count]) => ({
        category: category as VisitorCategory,
        count: count as number,
      }));

    const idempotencyKey = crypto.randomUUID();

    await enqueue({
      idempotencyKey,
      endpoint: '/registrations/group',
      body: {
        stationId,
        members,
        // Optional. If the card cannot be linked the registrations still stand
        // and only that card's journey goes untracked (PRODUCT_BRIEF §2.3).
        ...(shortCode.trim() ? { missionCardShortCode: shortCode.trim().toUpperCase() } : {}),
        idempotencyKey,
        clientRecordedAt: new Date().toISOString(),
      },
    });

    navigator.vibrate?.(15);
    router.replace('/capture/registration');
  }

  if (!session) return null;

  if (!stationId) {
    return (
      <AppShell title="Group" back={{ href: '/capture/registration', label: 'Registration' }}>
        <p className="tile">You are not on shift at the sign-up booth right now.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="A group arriving together"
      back={{ href: '/capture/registration', label: 'Registration' }}
    >
      <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
        Build the group, then confirm. Everyone is counted; the group shares one Mission Card.
      </p>

      <ul className="flex flex-col gap-2">
        {CATEGORIES.map((category) => {
          const count = counts[category.value] ?? 0;
          return (
            <li
              key={category.value}
              className="flex items-center justify-between gap-3 rounded-lg px-4 py-2"
              style={{ background: count > 0 ? 'var(--surface-alt)' : 'transparent' }}
            >
              <span className="font-semibold">{category.label}</span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Remove one ${category.label}`}
                  className="pill-quiet"
                  style={{ minWidth: 56 }}
                  onClick={() => adjust(category.value, -1)}
                  disabled={count === 0}
                >
                  −
                </button>
                <span className="w-6 text-center text-xl font-semibold" aria-live="polite">
                  {count}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${category.label}`}
                  className="pill"
                  style={{ minWidth: 56 }}
                  onClick={() => adjust(category.value, 1)}
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <label htmlFor="short-code" className="mt-6 block font-semibold">
        Mission Card code <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
      </label>
      <input
        id="short-code"
        value={shortCode}
        onChange={(event) => setShortCode(event.target.value)}
        maxLength={6}
        autoCapitalize="characters"
        placeholder="6 characters"
        className="mt-2 w-full rounded-lg border px-4 py-3 text-lg uppercase"
        style={{
          borderColor: 'var(--line)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minHeight: 48,
        }}
      />

      <button
        type="button"
        className="pill mt-6 w-full"
        style={{ minHeight: 56 }}
        disabled={total === 0 || saving}
        onClick={() => void submit()}
      >
        {total === 0
          ? 'Add at least one person'
          : `Register ${total} ${total === 1 ? 'person' : 'people'}`}
      </button>
    </AppShell>
  );
}
