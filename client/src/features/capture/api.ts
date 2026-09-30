import type { MissionCardRecord } from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';

/** The card a printed QR was generated for (F03-045). */
export async function resolveScannedCard(
  eventId: string,
  payload: string,
): Promise<MissionCardRecord> {
  return (
    await eventApi<{ card: MissionCardRecord }>(eventId, `/cards/qr/${encodeURIComponent(payload)}`)
  ).card;
}
