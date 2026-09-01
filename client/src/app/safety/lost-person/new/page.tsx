'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Raise a lost-person alert (PRODUCT_BRIEF §7.3).
 *
 * The highest-value single feature in the system, and the only place it holds a
 * description of a person. Two things shape this screen:
 *
 *  - it is sent directly, NOT through the outbox. A search that starts two
 *    minutes late because a queued write was waiting on a backoff timer is a
 *    search that failed. If the send fails the volunteer is told to use the
 *    radio, rather than being left believing the floor has been alerted.
 *
 *  - the standing instruction stays "call, don't tap". This coordinates a
 *    search; it is not the emergency channel, and the screen says so.
 */
export default function RaiseLostPersonPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [description, setDescription] = useState('');
  const [approxAge, setApproxAge] = useState('');
  const [clothing, setClothing] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await api('/lost-person', {
        method: 'POST',
        body: {
          descriptionText: description.trim(),
          ...(approxAge.trim() ? { approxAge: approxAge.trim() } : {}),
          ...(clothing.trim() ? { clothingText: clothing.trim() } : {}),
          ...(me?.currentAssignment ? { lastSeenStationId: me.currentAssignment.station.id } : {}),
          lastSeenAt: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      });

      router.replace('/home');
    } catch {
      setError(
        'The alert could not be sent. Call your IC on the radio now — do not wait for this screen.',
      );
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell title="Report a lost person" back={{ href: '/home', label: 'Home' }}>
      <p
        className="mb-5 rounded-lg px-4 py-3"
        style={{ background: 'var(--color-alert-surface)', color: 'var(--color-alert)' }}
      >
        <strong>If this is a medical or fire emergency, call — do not tap.</strong> This alert
        coordinates a search across every volunteer device.
      </p>

      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div>
          <label htmlFor="description" className="font-semibold">
            What has happened, and who are we looking for?
          </label>
          <textarea
            id="description"
            required
            minLength={3}
            maxLength={500}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Child separated from their group near the Welcome Lounge"
            className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div>
          <label htmlFor="age" className="font-semibold">
            Approximate age
          </label>
          <input
            id="age"
            value={approxAge}
            onChange={(event) => setApproxAge(event.target.value)}
            placeholder="about 8"
            className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
        </div>

        <div>
          <label htmlFor="clothing" className="font-semibold">
            What are they wearing?
          </label>
          <input
            id="clothing"
            value={clothing}
            onChange={(event) => setClothing(event.target.value)}
            placeholder="red jacket, dark jeans"
            className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
        </div>

        {me?.currentAssignment ? (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Last seen will be recorded as {me.currentAssignment.station.name}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: 'var(--color-alert)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-lg px-5 py-5 text-lg font-semibold"
          style={{ background: 'var(--color-alert)', color: '#ffffff', minHeight: 64 }}
          disabled={pending || description.trim().length < 3}
        >
          {pending ? 'Alerting everyone…' : 'Alert every volunteer now'}
        </button>

        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This description is deleted once the alert is resolved. Only the resolution time is kept
          for the post-event report.
        </p>
      </form>
    </AppShell>
  );
}
