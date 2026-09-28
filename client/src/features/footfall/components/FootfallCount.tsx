import type { ReactNode } from 'react';
export function FootfallCount({ sessionCount }: { sessionCount: number }): ReactNode {
  return (
    <p className="text-center">
      <span
        className="block font-display text-stat-lg font-semibold tabular-nums"
        aria-live="polite"
      >
        {sessionCount}
      </span>
      <span className="text-caption text-text-muted">counted on this device this session</span>
    </p>
  );
}
