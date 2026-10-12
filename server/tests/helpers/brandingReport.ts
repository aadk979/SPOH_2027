import type { FullReport } from '@spoh/shared';
export function brandingReport(): FullReport {
  return {
    generatedAt: '2026-10-11T00:00:00.000Z', range: { from: null, to: null }, timezone: 'UTC',
    event: { name: 'Synthetic, "event"\nName', slug: 'synthetic-report', status: 'CLOSED' },
    countingNote: 'Registrations, room entries and cards stay separate, even across days.', headline: null,
    registrations: { unit: 'registrations', total: 2, byCategory: [{ key: 'GROUP_A', label: '=Synthetic label', value: 2 }], byDay: [], byHour: [], voided: 0 },
    footfall: { unit: 'roomEntries', total: 0, byStation: [], curve: [], bySource: [] },
    cards: { unit: 'cards', issued: 0, completed: 0, voided: 0, completionRate: 0, issuedByDay: [], completedByDay: [], byStation: [] },
    gifts: { unit: 'redemptions', total: 0, byGiftType: [], byDay: [], byStation: [] },
    safety: { incidents: [], incidentsByType: [], nearMisses: 0, lostPerson: { cases: 0, resolved: 0, medianResolutionMinutes: null, byOutcome: [] }, lostAndFound: { logged: 0, claimed: 0, unclaimed: 0 } },
    volunteers: { volunteersActive: 0, assignments: 0, checkedIn: 0, noShows: 0, notYetDue: 0, noShowRate: 0, totalHours: 0, byStation: [] },
    dataIntegrity: { containsFallbackData: false, fallbackWindows: [], degradedMinutes: 0, recordsBySource: [], imports: [], voidedRecords: [] },
  };
}
