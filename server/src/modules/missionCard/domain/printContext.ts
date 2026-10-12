import type { FrozenBranding } from '@spoh/shared';
/** Frozen print labels are historical strings, independent of later relabels or retirement. */
export type CardPrintContext = {
  eventName: string;
  branding?: FrozenBranding | null;
  stampingStations: Array<{ id: string; name: string }>;
  batches: Array<{ shortCode: string; batchLabel: string | null }>;
};

export interface PrintableCard {
  shortCode: string;
  qrPayload: string;
  batchLabel: string | null;
  rehearsal: boolean;
}
