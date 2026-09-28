import type { FullReport } from '@spoh/shared';
import { listFallbackWindows } from '../../fallback/index.js';
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
  importBatches,
  incidentsInRange,
  lostFoundCounts,
  lostPersonSummaries,
  recordsBySource,
  registrationTotals,
  registrationsByDay,
  registrationsByHour,
  unpurgedLostPersonCount,
  voidedCounts,
  volunteerAttendance,
  type Range,
} from '../data/repo.js';
import { footfallSection, safetySection, volunteersSection } from '../domain/sections.js';

/** One loader per report section: its own queries, then its builder. */

type Names = ReadonlyMap<string, string>;
type Report = FullReport;

export async function registrationsReport(range: Range): Promise<Report['registrations']> {
  const [totals, byDay, byHour] = await Promise.all([
    registrationTotals(range),
    registrationsByDay(range),
    registrationsByHour(range),
  ]);
  return {
    unit: 'registrations',
    total: totals.total,
    byCategory: totals.byCategory,
    byDay,
    byHour,
    voided: totals.voided,
  };
}

export async function footfallReport(range: Range, names: Names): Promise<Report['footfall']> {
  const [total, curve, bySource] = await Promise.all([
    footfallTotals(range),
    footfallCurve(range),
    footfallBySource(range),
  ]);
  return footfallSection({ total, curve, bySource }, names);
}

export async function cardsReport(range: Range, names: Names): Promise<Report['cards']> {
  const [cards, issuedByDay, completedByDay, perStation] = await Promise.all([
    cardTotals(range),
    cardsByDay(range, 'issuedAt'),
    cardsByDay(range, 'completedAt'),
    cardsPerStation(range),
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

export async function giftsReport(range: Range, names: Names): Promise<Report['gifts']> {
  const [gifts, byDay, byStation] = await Promise.all([
    listGifts(),
    giftRedemptionsByDay(range),
    giftRedemptionsByStation(range),
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

export async function safetyReport(range: Range): Promise<Report['safety']> {
  const [incidents, summaries, unpurged, lostFound] = await Promise.all([
    incidentsInRange(range),
    lostPersonSummaries(range),
    unpurgedLostPersonCount(range),
    lostFoundCounts(range),
  ]);
  return safetySection({ incidents, summaries, unpurged, lostFound });
}

export async function volunteersReport(
  range: Range,
  names: Names,
  now: Date,
): Promise<Report['volunteers']> {
  const [attendance, volunteersActive] = await Promise.all([
    volunteerAttendance(range),
    countActiveVolunteers(),
  ]);
  return volunteersSection(attendance, { volunteersActive, stationName: names, now });
}

export async function integrityReport(range: Range): Promise<Report['dataIntegrity']> {
  const [windows, imports, sources, voided] = await Promise.all([
    listFallbackWindows({ from: range.from, to: range.to }),
    importBatches(range),
    recordsBySource(range),
    voidedCounts(range),
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
