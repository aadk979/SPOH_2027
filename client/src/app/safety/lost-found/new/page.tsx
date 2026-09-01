'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * Log a found item (PRODUCT_BRIEF §7.2).
 *
 * Three fields that matter: what it is, where it was found, and where it is
 * being kept. The third is the one people forget and the one that makes the
 * item findable again.
 *
 * There is deliberately no field for who lost it. This is a record of an
 * object, not of a person.
 */
export default function NewLostFoundPage(): ReactNode {
  const session = useRequireSession();
  const router = useRouter();
  const { data: me } = useMe();

  const [itemLabel, setItemLabel] = useState('');
  const [categoryLabel, setCategoryLabel] = useState('');
  const [holderNote, setHolderNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await api('/lost-found', {
        method: 'POST',
        body: {
          itemLabel: itemLabel.trim(),
          ...(categoryLabel.trim() ? { categoryLabel: categoryLabel.trim() } : {}),
          ...(holderNote.trim() ? { holderNote: holderNote.trim() } : {}),
          ...(me?.currentAssignment ? { foundStationId: me.currentAssignment.station.id } : {}),
          foundAt: new Date().toISOString(),
        },
      });

      router.replace('/safety/lost-found');
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!session) return null;

  return (
    <AppShell
      title="Log a found item"
      back={{ href: '/safety/lost-found', label: 'Lost and found' }}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <div>
          <label htmlFor="item" className="font-semibold">
            What is it?
          </label>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Describe it the way somebody would ask for it.
          </p>
          <input
            id="item"
            required
            minLength={2}
            maxLength={120}
            value={itemLabel}
            onChange={(event) => setItemLabel(event.target.value)}
            placeholder="Blue metal water bottle with stickers"
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
          <label htmlFor="category" className="font-semibold">
            Kind of thing <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <input
            id="category"
            maxLength={60}
            value={categoryLabel}
            onChange={(event) => setCategoryLabel(event.target.value)}
            placeholder="Bottle, bag, phone, clothing…"
            className="mt-2 w-full rounded-lg border px-4 py-3"
            style={{
              borderColor: 'var(--line)',
              background: 'var(--surface)',
              color: 'var(--text)',
              minHeight: 48,
            }}
          />
        </div>

        <div>
          <label htmlFor="holder" className="font-semibold">
            Where is it being kept?
          </label>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            The field people forget, and the one that makes it findable again.
          </p>
          <input
            id="holder"
            maxLength={200}
            value={holderNote}
            onChange={(event) => setHolderNote(event.target.value)}
            placeholder="Held at the Mission Complete desk"
            className="mt-2 w-full rounded-lg border px-4 py-3"
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
            Recorded as found at {me.currentAssignment.station.name}.
          </p>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: 'var(--color-alert)' }}>
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="pill w-full"
          style={{ minHeight: 56 }}
          disabled={pending || itemLabel.trim().length < 2}
        >
          {pending ? 'Saving…' : 'Log this item'}
        </button>

        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Do not record anything about the person who lost it.
        </p>
      </form>
    </AppShell>
  );
}
