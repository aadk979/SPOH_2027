'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { VisitorCategory } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { Button, Callout, Card, EmptyState, Field, Input, cx } from '@/components/ui';
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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);

    const members = Object.entries(counts)
      .filter(([, count]) => (count ?? 0) > 0)
      .map(([category, count]) => ({
        category: category as VisitorCategory,
        count: count as number,
      }));

    const idempotencyKey = crypto.randomUUID();

    try {
      await enqueue({
        idempotencyKey,
        endpoint: '/registrations/group',
        body: {
          stationId,
          members,
          // Optional. If the card cannot be linked the registrations still
          // stand and only that card's journey goes untracked (PRODUCT_BRIEF
          // §2.3).
          ...(shortCode.trim() ? { missionCardShortCode: shortCode.trim().toUpperCase() } : {}),
          idempotencyKey,
          clientRecordedAt: new Date().toISOString(),
        },
      });
    } catch {
      // The local write itself failed. Without this the button stayed
      // disabled forever with no explanation — the group was never queued
      // and the volunteer had no way to know or retry.
      setSaving(false);
      setError('This group was not recorded. Try again, and tell your IC if it keeps happening.');
      return;
    }

    navigator.vibrate?.(15);
    router.replace('/capture/registration');
  }

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

        <ul className="flex flex-col gap-xxs">
          {CATEGORIES.map((category) => {
            const count = counts[category.value] ?? 0;
            return (
              <li
                key={category.value}
                className={cx(
                  'flex items-center justify-between gap-sm rounded-lg px-md py-xs transition-colors',
                  // The filled row is how a volunteer checks the composition at
                  // a glance before committing four rows to the dataset.
                  count > 0 ? 'bg-surface-alt' : 'bg-transparent',
                )}
              >
                <span className={cx('min-w-0', count > 0 && 'font-semibold')}>
                  {category.label}
                </span>

                <span className="flex shrink-0 items-center gap-sm">
                  <Stepper
                    label={`Remove one ${category.label}`}
                    glyph="−"
                    variant="quiet"
                    onClick={() => adjust(category.value, -1)}
                    disabled={count === 0}
                  />

                  {/*
                    `aria-live` on the number rather than the row: a screen
                    reader should hear "3" after a tap, not the whole row again.
                  */}
                  <span
                    className="w-[2ch] text-center text-tagline font-semibold tabular-nums"
                    aria-live="polite"
                  >
                    {count}
                  </span>

                  <Stepper
                    label={`Add one ${category.label}`}
                    glyph="+"
                    variant="primary"
                    onClick={() => adjust(category.value, 1)}
                  />
                </span>
              </li>
            );
          })}
        </ul>

        <Card
          as="form"
          variant="flat"
          className="flex flex-col gap-md"
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            id="short-code"
            label="Mission Card code"
            optional
            hint="Six characters, printed under the QR code."
            error={
              shortCode.trim().length > 0 && shortCode.trim().length !== 6
                ? 'Card code must be exactly 6 characters.'
                : null
            }
          >
            {(props) => (
              <Input
                {...props}
                value={shortCode}
                onChange={(event) =>
                  setShortCode(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())
                }
                onPaste={(event) => {
                  event.preventDefault();
                  const pasted = event.clipboardData.getData('text');
                  const cleaned = pasted.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
                  setShortCode(cleaned);
                }}
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="6 characters"
                scale="lg"
                className="font-display tracking-[0.2em] uppercase"
              />
            )}
          </Field>

          {error ? (
            <Callout tone="alert" role="alert">
              {error}
            </Callout>
          ) : null}

          <Button
            type="submit"
            size="lg"
            block
            disabled={
              total === 0 || saving || (shortCode.trim().length > 0 && shortCode.trim().length !== 6)
            }
          >
            {total === 0
              ? 'Add at least one person'
              : `Register ${total} ${total === 1 ? 'person' : 'people'}`}
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}

/**
 * A +/- control for one category row.
 *
 * The glyph is `aria-hidden` because the button's real name is "Add one
 * Sec 4" — a screen reader reading out "plus" tells nobody which row it
 * belongs to.
 */
function Stepper({
  label,
  glyph,
  variant,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  variant: 'primary' | 'quiet';
  onClick(): void;
  disabled?: boolean;
}): ReactNode {
  return (
    <Button
      variant={variant}
      size="icon"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="size-[44px] sm:size-[56px]"
    >
      <span aria-hidden="true">{glyph}</span>
    </Button>
  );
}
