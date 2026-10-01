import type { CountsMode } from '@spoh/shared';

/** The counts rule as the settings screen edits it, before it is a valid value. */
export interface CountsDraft {
  mode: 'separate' | 'headline';
  count: 'registrations' | 'footfall' | 'journeys';
  stationId: string;
}

export function draftOf(value: CountsMode): CountsDraft {
  if (value.mode === 'separate') return { mode: 'separate', count: 'registrations', stationId: '' };
  const { source } = value;
  return {
    mode: 'headline',
    count: source.count,
    stationId: source.count === 'footfall' ? source.stationId : '',
  };
}

/** The value to save, or null while a footfall headline has no station yet. */
export function countsModeOf(draft: CountsDraft): CountsMode | null {
  if (draft.mode === 'separate') return { mode: 'separate' };
  if (draft.count === 'footfall') {
    return draft.stationId
      ? { mode: 'headline', source: { count: 'footfall', stationId: draft.stationId } }
      : null;
  }
  return { mode: 'headline', source: { count: draft.count } };
}

export function sameCountsMode(a: CountsMode, b: CountsMode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
