'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { LostFoundRecord } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * The lost-and-found desk (PRODUCT_BRIEF §7.2).
 *
 * Search-first, because the question this screen answers is almost always "has
 * anyone handed in a blue water bottle?" rather than "show me everything".
 *
 * Note what is not here: no field for who lost the item, and none for who
 * claimed it. An item is described, a place is recorded, and a claim is a
 * status change — anything more would put visitor personal data into a system
 * that deliberately holds none.
 */
export default function LostFoundPage(): ReactNode {
  const session = useRequireSession();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [heldOnly, setHeldOnly] = useState(true);

  const items = useQuery({
    queryKey: ['lost-found', query, heldOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (heldOnly) params.set('status', 'HELD');

      return (await api<{ data: LostFoundRecord[] }>(`/lost-found?${params.toString()}`)).data;
    },
    enabled: session !== null,
  });

  const claim = useMutation({
    mutationFn: (id: string) => api(`/lost-found/${id}/claim`, { method: 'POST', body: {} }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lost-found'] }),
  });

  if (!session) return null;

  const results = items.data ?? [];

  return (
    <AppShell
      width="wide"
      title="Lost and found"
      back={{ href: '/home', label: 'Home' }}
      actions={
        <Link href="/safety/lost-found/new" className="pill">
          Log an item
        </Link>
      }
    >
      <label htmlFor="search" className="block font-semibold">
        What are they looking for?
      </label>
      <input
        id="search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="blue water bottle"
        className="mt-2 w-full rounded-lg border px-4 py-3 text-lg"
        style={{
          borderColor: 'var(--line)',
          background: 'var(--surface)',
          color: 'var(--text)',
          minHeight: 48,
        }}
      />

      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={heldOnly}
          onChange={(event) => setHeldOnly(event.target.checked)}
        />
        Only items still held
      </label>

      <p className="mt-5 mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        {items.isLoading
          ? 'Searching…'
          : `${results.length} item${results.length === 1 ? '' : 's'}`}
      </p>

      {results.length === 0 && !items.isLoading ? (
        <p className="tile" style={{ color: 'var(--text-muted)' }}>
          Nothing matching. Try a shorter word — the label was typed in a hurry.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((item) => (
            <li key={item.id} className="tile">
              <p className="text-lg font-semibold">{item.itemLabel}</p>

              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {item.categoryLabel ? `${item.categoryLabel} · ` : ''}
                Found {formatTime(item.foundAt)}
                {item.foundStationName ? ` at ${item.foundStationName}` : ''}
              </p>

              {item.holderNote ? (
                <p className="mt-1 text-sm">
                  <strong>Where it is:</strong> {item.holderNote}
                </p>
              ) : null}

              <p
                className="mt-2 text-sm font-semibold"
                style={{ color: statusColour(item.status) }}
              >
                {/* Status is a word, never carried by colour alone. */}
                {readableStatus(item.status)}
              </p>

              {item.status === 'HELD' ? (
                <button
                  type="button"
                  className="pill mt-3"
                  disabled={claim.isPending}
                  onClick={() => claim.mutate(item.id)}
                >
                  Mark claimed
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

function readableStatus(status: LostFoundRecord['status']): string {
  switch (status) {
    case 'HELD':
      return 'Held';
    case 'CLAIMED':
      return 'Claimed';
    case 'UNCLAIMED_AT_CLOSE':
      return 'Unclaimed at close of event';
    case 'DISPOSED':
      return 'Disposed';
  }
}

function statusColour(status: LostFoundRecord['status']): string {
  return status === 'HELD'
    ? 'var(--color-warn)'
    : status === 'CLAIMED'
      ? 'var(--color-ok)'
      : 'var(--text-muted)';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
}
