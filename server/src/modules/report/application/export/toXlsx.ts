import ExcelJS from 'exceljs';
import type { FullReport } from '@spoh/shared';
import { writeCardsSheet } from './sheets/cards.js';
import { writeFootfallSheet } from './sheets/footfall.js';
import { writeGiftsSheet } from './sheets/gifts.js';
import { writeIntegritySheet } from './sheets/integrity.js';
import { writeReadMeSheet } from './sheets/readMe.js';
import { writeRegistrationsSheet } from './sheets/registrations.js';
import { writeSafetySheet } from './sheets/safety.js';
import { writeVolunteersSheet } from './sheets/volunteers.js';

/**
 * Report export (PRODUCT_BRIEF §10).
 *
 * One workbook for the Lead (Comms & Outreach), one sheet per section, in the
 * order somebody would actually read them.
 *
 * The first sheet is the counting note. It is not decoration: the single most
 * likely misuse of this workbook is somebody adding the registration total to
 * the room-entry total, and the sheet that opens by default is the cheapest
 * place to say why that number would be meaningless.
 */
export async function toXlsx(report: FullReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = report.event.name;
  workbook.created = new Date(report.generatedAt);

  writeReadMeSheet(workbook, report);
  writeRegistrationsSheet(workbook, report);
  writeFootfallSheet(workbook, report);
  writeCardsSheet(workbook, report);
  writeGiftsSheet(workbook, report);
  writeSafetySheet(workbook, report);
  writeVolunteersSheet(workbook, report);
  writeIntegritySheet(workbook, report);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
