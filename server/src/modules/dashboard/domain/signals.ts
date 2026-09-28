/**
 * The dashboard's judgements: which devices have gone quiet and which are
 * tapping faster than anybody counts. Pure, so the thresholds are testable.
 */

/** A checked-in person's minutes since their last capture; null if they have recorded nothing. */
export function staleDevices<T extends { minutesSinceLastCapture: number | null }>(
  rows: readonly T[],
  staleAfterMinutes: number,
): T[] {
  return rows.filter(
    (row) =>
      row.minutesSinceLastCapture === null || row.minutesSinceLastCapture >= staleAfterMinutes,
  );
}

/**
 * Rate over the window a device was actually active, not over the whole day:
 * someone who arrived at noon should not look slow. An implausible rate
 * usually means someone is tapping to catch up rather than counting as
 * visitors arrive (§2.4).
 */
export function deviceRate(
  value: number,
  activeMinutes: number,
  implausiblePerMinute: number,
): { perMinute: number; rateAnomaly: boolean } {
  const perMinute = value / Math.max(1, activeMinutes);
  return {
    perMinute: Math.round(perMinute * 10) / 10,
    rateAnomaly: perMinute > implausiblePerMinute,
  };
}
