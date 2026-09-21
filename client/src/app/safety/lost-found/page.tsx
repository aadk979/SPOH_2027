'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { LostFoundRecord } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingCards,
  StatusText,
  type Tone,
} from '@/components/ui';
import { useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

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
  const [searchInput, setSearchInput] = useState('');
  const [heldOnly, setHeldOnly] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
        <ButtonLink href="/safety/lost-found/new" size="sm">
          Log an item
        </ButtonLink>
      }
    >
      {/*
        The search box is capped at a reading measure even on the wide shell:
        the results are a grid, but the question is one short phrase.
      */}
      <div className="max-w-panel">
        <Field
          id="search"
          label="What are they looking for?"
          hint="One or two words. The label was typed in a hurry, so a shorter word finds more."
        >
          {(props) => (
            <Input
              {...props}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="blue water bottle"
              scale="lg"
            />
          )}
        </Field>

        <Checkbox
          label="Only items still held"
          checked={heldOnly}
          onChange={(event) => setHeldOnly(event.target.checked)}
        />
      </div>

      {claim.isError ? (
        <Callout tone="alert" role="alert" className="mt-md">
          Could not mark item as claimed. Check your connection and try again.
        </Callout>
      ) : null}

      <p className="mt-md mb-sm text-caption text-text-muted" aria-live="polite">
        {items.isLoading
          ? 'Searching…'
          : `${results.length} item${results.length === 1 ? '' : 's'}`}
      </p>

      {items.isLoading ? (
        <LoadingCards count={3} label="Searching lost and found" />
      ) : results.length === 0 ? (
        <EmptyState title="Nothing matching">
          Try a shorter word, or clear the filter to include items already claimed.
        </EmptyState>
      ) : (
        <ul className="grid gap-sm sm:grid-cols-2 sm:gap-md lg:grid-cols-3">
          {results.map((item) => (
            <Card as="li" key={item.id} className="flex flex-col">
              <p className="text-tagline font-semibold">{item.itemLabel}</p>

              <p className="text-caption text-text-muted">
                {item.categoryLabel ? `${item.categoryLabel} · ` : ''}
                Found {formatDateTime(item.foundAt)}
                {item.foundStationName ? ` at ${item.foundStationName}` : ''}
              </p>

              {item.holderNote ? (
                <p className="mt-xs text-caption">
                  <strong>Where it is:</strong> {item.holderNote}
                </p>
              ) : null}

              {item.photoKey ? (
                <p className="mt-xs text-caption text-text-muted">
                  <span aria-hidden="true">📷 </span>
                  Photo on file
                </p>
              ) : null}

              {/* Status is a word, never carried by colour alone. */}
              <StatusText tone={statusTone(item.status)} className="mt-sm block">
                {readableStatus(item.status)}
              </StatusText>

              {item.status === 'HELD' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-sm self-start"
                  disabled={claim.isPending && claim.variables === item.id}
                  onClick={() => claim.mutate(item.id)}
                  // Otherwise a screen-reader user hears "Mark claimed" once per
                  // card with no way to tell which item they are about to close.
                  aria-label={`Mark ${item.itemLabel} claimed`}
                >
                  {claim.isPending && claim.variables === item.id ? 'Claiming…' : 'Mark claimed'}
                </Button>
              ) : null}
            </Card>
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

function statusTone(status: LostFoundRecord['status']): Tone {
  return status === 'HELD' ? 'warn' : status === 'CLAIMED' ? 'ok' : 'neutral';
}
