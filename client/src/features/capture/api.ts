import type { MissionCardRecord } from '@spoh/shared';
import { api } from '@/shared/lib/api';

/** The card a printed QR was generated for (F03-045). */
export async function resolveScannedCard(payload: string): Promise<MissionCardRecord> {
  return (await api<{ card: MissionCardRecord }>(`/cards/qr/${encodeURIComponent(payload)}`)).card;
}
