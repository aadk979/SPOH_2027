export type DeclarationValues = { tier: '3' | '4'; reason: string; stationId: string };

export const EMPTY_DECLARATION: DeclarationValues = { tier: '3', reason: '', stationId: '' };

/** The request body before schema validation; no station means event-wide. */
export function toDeclareFallbackRequest(values: DeclarationValues) {
  return {
    tier: Number(values.tier),
    reason: values.reason.trim(),
    ...(values.stationId ? { stationId: values.stationId } : {}),
  };
}
