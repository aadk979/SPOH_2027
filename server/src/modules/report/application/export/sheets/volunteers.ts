import type { FullReport } from '@spoh/shared';
import type { ExcelJS } from '../format.js';
import { SHEETS, header } from '../format.js';

export function writeVolunteersSheet(workbook: ExcelJS.Workbook, report: FullReport): void {
  const sheet = workbook.addWorksheet(SHEETS.volunteers);
  sheet.columns = [{ width: 32 }, { width: 16 }, { width: 16 }, { width: 12 }];

  sheet.addRow([`Active volunteers: ${report.volunteers.volunteersActive}`]);
  sheet.addRow([`Shift assignments: ${report.volunteers.assignments}`]);
  sheet.addRow([`Checked in: ${report.volunteers.checkedIn}`]);
  sheet.addRow([
    `No-shows: ${report.volunteers.noShows} (${(report.volunteers.noShowRate * 100).toFixed(1)}%)`,
  ]);
  sheet.addRow([`Not yet due: ${report.volunteers.notYetDue}`]);
  sheet.addRow([`Total hours: ${report.volunteers.totalHours}`]);
  sheet.addRow([
    'Hours count check-in to check-out. Anyone who never checked out contributes zero rather than an open-ended figure.',
  ]);
  sheet.addRow([]);

  header(sheet, ['Station', 'Assignments', 'Checked in', 'Hours']);
  for (const row of report.volunteers.byStation) {
    sheet.addRow([row.stationName, row.assignments, row.checkedIn, row.hours]);
  }
}
