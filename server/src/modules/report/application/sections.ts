import type { FullReport } from '@spoh/shared';
import { listFallbackWindows } from '../../fallback/index.js';
import { singaporeHourKey } from '../../../platform/time/index.js';
import { listGifts } from '../../gift/index.js';
import {
  cardTotals,
  cardsByDay,
  cardsPerStation,
  countActiveVolunteers,
  footfallBySource,
  footfallCurve,
  footfallTotals,
  giftRedemptionsByDay,
  giftRedemptionsByStation,
  incidentsInRange,
  lostFoundCounts,
  lostPersonSummaries,
  registrationTotals,
  registrationsByDay,
  registrationsByHour,
  unpurgedLostPersonCount,
  volunteerAttendance,
  type Range,
} from '../data/repo.js';
import { importBatches, recordsBySource, voidedCounts } from '../data/integrity.js';
import { footfallSection, safetySection, volunteersSection } from '../domain/sections.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** One loader per report section: its own queries, then its builder. */

type Names = ReadonlyMap<string, string>;
type Report = FullReport;

export async function registrationsReport(
  scope: EventScope,
  range: Range,
): Promise<Report['registrations']> {
  const [totals, byDay, byHour] = await Promise.all([
    registrationTotals(scope, range),
    registrationsByDay(scope, range),
    registrationsByHour(scope, range),
  ]);
  return {
    unit: 'registrations',
    total: totals.total,
    byCategory: totals.byCategory,
    byDay,
    // Labelled in Singapore time: the committee reads "10:00", not "02:00".
    byHour: byHour.map((row) => ({
      hour: row.hour.toISOString(),
      localHour: singaporeHourKey(row.hour).replace('T', ' ') + ':00',
      value: row.value,
    })),
    voided: totals.voided,
  };
}

export async function footfallReport(
  scope: EventScope,
  range: Range,
  names: Names,
): Promise<Report['footfall']> {
  const [total, curve, bySource] = await Promise.all([
    footfallTotals(scope, range),
    footfallCurve(scope, range),
    footfallBySource(scope, range),
  ]);
  return footfallSection({ total, curve, bySource }, names);
}

export async function cardsReport(
  scope: EventScope,
  range: Range,
  names: Names,
): Promise<Report['cards']> {
  const [cards, issuedByDay, completedByDay, perStation] = await Promise.all([
    cardTotals(scope, range),
    cardsByDay(scope, range, 'issuedAt'),
    cardsByDay(scope, range, 'completedAt'),
    cardsPerStation(scope, range),
  ]);
  return {
    unit: 'cards',
    issued: cards.issued,
    completed: cards.completed,
    voided: cards.voided,
    completionRate: cards.issued === 0 ? 0 : cards.completed / cards.issued,
    issuedByDay,
    completedByDay,
    byStation: perStation.map((row) => ({
      stationId: row.stationId,
      stationName: names.get(row.stationId) ?? 'Unknown',
      cards: row.cards,
    })),
  };
}

export async function giftsReport(
  scope: EventScope,
  range: Range,
  names: Names,
): Promise<Report['gifts']> {
  const [gifts, byDay, byStation] = await Promise.all([
    listGifts(scope),
    giftRedemptionsByDay(scope, range),
    giftRedemptionsByStation(scope, range),
  ]);
  return {
    unit: 'redemptions',
    total: gifts.reduce((sum, gift) => sum + gift.redeemed, 0),
    byGiftType: gifts.map((gift) => ({
      giftTypeId: gift.id,
      giftTypeName: gift.name,
      redeemed: gift.redeemed,
      remaining: gift.remaining,
    })),
    byDay,
    byStation: byStation.map((row) => ({
      stationId: row.stationId,
      stationName: names.get(row.stationId) ?? 'Unknown',
      value: row.value,
    })),
  };
}

export async function safetyReport(scope: EventScope, range: Range): Promise<Report['safety']> {
  const [incidents, summaries, unpurged, lostFound] = await Promise.all([
    incidentsInRange(scope, range),
    lostPersonSummaries(scope, range),
    unpurgedLostPersonCount(scope, range),
    lostFoundCounts(scope, range),
  ]);
  return safetySection({ incidents, summaries, unpurged, lostFound });
}

export async function volunteersReport(
  scope: EventScope,
  range: Range,
  { names, now }: { names: Names; now: Date },
): Promise<Report['volunteers']> {
  const [attendance, volunteersActive] = await Promise.all([
    volunteerAttendance(scope, range),
    countActiveVolunteers(scope),
  ]);
  return volunteersSection(attendance, { volunteersActive, stationName: names, now });
}

export async function integrityReport(
  scope: EventScope,
  range: Range,
): Promise<Report['dataIntegrity']> {
  const [windows, imports, sources, voided] = await Promise.all([
    listFallbackWindows(scope, { from: range.from, to: range.to }),
    importBatches(scope, range),
    recordsBySource(scope, range),
    voidedCounts(scope, range),
  ]);
  return {
    containsFallbackData: windows.length > 0,
    fallbackWindows: windows,
    degradedMinutes: windows.reduce((sum, window) => sum + (window.durationMinutes ?? 0), 0),
    recordsBySource: sources,
    imports: imports.map((batch) => ({
      id: batch.id,
      source: batch.source,
      targetTable: batch.targetTable,
      rowCount: batch.rowCount,
      fileName: batch.fileName,
      importedAt: batch.importedAt.toISOString(),
      notes: batch.notes,
    })),
    voidedRecords: voided,
  };
}
