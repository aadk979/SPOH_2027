import type { FallbackWindowRecord } from '@spoh/shared';
import { listWindows } from '../data/repo.js';
import { windowRecords } from './windowRecord.js';

/** Windows overlapping a range, oldest first: they explain the numbers. */
export async function listFallbackWindows(range: {
  from?: Date;
  to?: Date;
}): Promise<FallbackWindowRecord[]> {
  return windowRecords(await listWindows(range));
}
