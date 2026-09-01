'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { IncidentSeverity, IncidentType } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Incident report (PRODUCT_BRIEF §7.1).
 *
 * Structured, so the slide-43 incident log is generated rather than
 * reconstructed from memory a week later. Location is pre-filled from the
 * reporter's station, and the description field is labelled to describe the
 * EVENT rather than the people — the one free-text box a volunteer can reach,
 * and the one place a name could accidentally end up.
 *
 * Immutable once submitted: corrections go into the append-only follow-up log,
 * which is an IC action.
 */

const TYPES: Array<{ value: IncidentType; label: string }> = [
  { value: 'INJURY', label: 'Injury' },
  { value: 'ILLNESS', label: 'Illness' },
  { value: 'NEAR_MISS', label: 'Near miss' },
  { value: 'SAFETY_CONCERN', label: 'Safety concern' },
  { value: 'CROWD_CONCERN', label: 'Crowd concern' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'OTHER', label: 'Other' },
];

const SEVERITIES: Array<{ value: IncidentSeverity; label: string; hint: string }> = [
  { value: 'LOW', label: 'Low', hint: 'Noted, no action needed now' },
  { value: 'MEDIUM', label: 'Medium', hint: 'Needs attention this shift' },
  { value: 'HIGH', label: 'High', hint: 'Needs an IC now' },
  { value: 'CRITICAL', label: 'Critical', hint: 'Call as well as reporting' },
];

export default function NewIncidentPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [type, setType] = useState<IncidentType>('NEAR_MISS');
  const [severity, setSeverity] = useState<IncidentSeverity>('LOW');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await api('/incidents', {
        method: 'POST',
        body: {
          type,
          severity,
          ...(me?.currentAssignment ? { stationId: me.currentAssignment.station.id } : {}),
          ...(locationNote.trim() ? { locationNote: locationNote.trim() } : {}),
          description: description.trim(),
          occurredAt: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      });

      router.replace('/home');
    } catch {
      setError('The report could not be sent. Tell your IC directly, then try again.');
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell title="Report an incident" back={{ href: '/home', label: 'Home' }}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <fieldset>
          <legend className="font-semibold">What kind of incident?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                aria-pressed={type === option.value}
                className="rounded-full border px-4 py-3"
                style={{
                  minHeight: 44,
                  borderColor: type === option.value ? 'var(--color-primary)' : 'var(--line)',
                  background: type === option.value ? 'var(--color-primary)' : 'var(--surface)',
                  color: type === option.value ? 'var(--color-on-primary)' : 'var(--text)',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold">How serious is it?</legend>
          <div className="mt-2 flex flex-col gap-2">
            {SEVERITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSeverity(option.value)}
                aria-pressed={severity === option.value}
                className="flex items-baseline gap-3 rounded-lg border px-4 py-3 text-left"
                style={{
                  minHeight: 48,
                  borderColor: severity === option.value ? 'var(--color-primary)' : 'var(--line)',
                  background: severity === option.value ? 'var(--surface-alt)' : 'var(--surface)',
                }}
              >
                {/* Severity is never carried by colour alone (BUILD_PLAN §9.7). */}
                <span className="font-semibold">{option.label}</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="description" className="font-semibold">
            What happened?
          </label>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Describe the event, not the people. No names.
          </p>
          <textarea
            id="description"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="A cable across the walkway was taped down after someone tripped on it."
            className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div>
          <label htmlFor="location" className="font-semibold">
            Where, exactly?
          </label>
          <input
            id="location"
            value={locationNote}
            onChange={(event) => setLocationNote(event.target.value)}
            placeholder={
              me?.currentAssignment
                ? `Near the entrance to ${me.currentAssignment.station.name}`
                : 'T19, level 2 walkway'
            }
            maxLength={200}
            className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
          {me?.currentAssignment ? (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Recorded against {me.currentAssignment.station.name}.
            </p>
          ) : null}
        </div>

        {error ? (
          <p role="alert" style={{ color: 'var(--color-alert)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="pill w-full"
          style={{ minHeight: 56 }}
          disabled={pending || description.trim().length < 10}
        >
          {pending ? 'Sending…' : 'Submit report'}
        </button>

        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This goes straight to the Safety IC, the Deputy Coordinator and the Chief. Once submitted
          it cannot be edited — updates are added as follow-ups.
        </p>
      </form>
    </AppShell>
  );
}
