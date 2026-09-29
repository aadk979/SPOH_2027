import type { MissionCardRecord } from '@spoh/shared';
import { toMissionCardRecord } from '../data/mappers.js';
import { findCardByQrPayload, findCardByShortCode } from '../data/repo.js';
import { requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { stampingStationIds } from './stampingStations.js';

/** A card and where its visitor should go next. */
export async function getCard(shortCodeInput: string): Promise<MissionCardRecord> {
  const card = requireCard(await findCardByShortCode(normaliseShortCode(shortCodeInput)));
  return toMissionCardRecord(card, await stampingStationIds());
}

/** The card a printed QR was generated for (F03-045). */
export async function getCardByQr(payload: string): Promise<MissionCardRecord> {
  const card = requireCard(await findCardByQrPayload(payload));
  return toMissionCardRecord(card, await stampingStationIds());
}
