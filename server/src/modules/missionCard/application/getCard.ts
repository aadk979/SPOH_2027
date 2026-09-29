import type { MissionCardRecord } from '@spoh/shared';
import { toMissionCardRecord } from '../data/mappers.js';
import { findCardByQrPayload, findCardByShortCode } from '../data/repo.js';
import { requireCard } from '../domain/cardRules.js';
import { normaliseShortCode } from '../domain/shortCode.js';
import { stampingStationIds } from './stampingStations.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** A card and where its visitor should go next. */
export async function getCard(
  scope: EventScope,
  shortCodeInput: string,
): Promise<MissionCardRecord> {
  const card = requireCard(await findCardByShortCode(scope, normaliseShortCode(shortCodeInput)));
  return toMissionCardRecord(card, await stampingStationIds(scope));
}

/** The card a printed QR was generated for (F03-045). */
export async function getCardByQr(scope: EventScope, payload: string): Promise<MissionCardRecord> {
  const card = requireCard(await findCardByQrPayload(scope, payload));
  return toMissionCardRecord(card, await stampingStationIds(scope));
}
