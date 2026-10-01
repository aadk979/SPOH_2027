import type { ReactNode } from 'react';
import type { Headline } from '@spoh/shared';
import { StatTile } from './StatTile';

/**
 * The event's headline figure (ADR-002 §4), above the three counts and never
 * instead of them. It says where it comes from, because it is one of them.
 */
export function HeadlineTile({ headline }: { headline: Headline | null }): ReactNode {
  if (!headline) return null;
  return (
    <StatTile
      large
      label="Visitors"
      value={headline.value}
      unit={headline.sourceLabel}
      note="One of the three counts below, not their sum."
    />
  );
}
