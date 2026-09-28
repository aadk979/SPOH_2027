'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { FoundItemCard } from '../components/FoundItemCard';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, Checkbox, EmptyState, Field, Input, LoadingCards } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { useLostFound, useClaimLostFound } from '@/features/lostFound';

/**
 * The lost-and-found desk (remediation/phases/P07-client-refactor.md).
 *
 * Search-first, because the question this screen answers is almost always "has
 * anyone handed in a blue water bottle?" rather than "show me everything".
 *
 * Note what is not here: no field for who lost the item, and none for who
 * claimed it. An item is described, a place is recorded, and a claim is a
 * status change — anything more would put visitor personal data into a system
 * that deliberately holds none.
 */
export default function LostFoundScreen(): ReactNode {
  const session = useRequireSession();
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [heldOnly, setHeldOnly] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const items = useLostFound({ query, heldOnly }, session !== null);
  const claim = useClaimLostFound();

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
            <FoundItemCard key={item.id} item={item} claim={claim} />
          ))}
        </ul>
      )}
    </AppShell>
  );
}
