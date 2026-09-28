import type { FallbackWindowRecord } from '@spoh/shared';
import { listWindows } from '../data/repo.js';
import { windowRecord } from './windowRecord.js';

/** Windows overlapping a range, oldest first: they explain the numbers. */
export async function listFallbackWindows(range: {
  from?: Date;
  to?: Date;
}): Promise<FallbackWindowRecord[]> {
  const windows = await listWindows(range);
  return Promise.all(windows.map(windowRecord));
}
