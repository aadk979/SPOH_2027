import type { CaptureCategoriesResponse } from '@spoh/shared';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { listActiveCategories } from '../data/repo.js';

/** The booth's buttons: the event's active categories, in order (ADR-002). */
export async function listCaptureCategories(scope: EventScope): Promise<CaptureCategoriesResponse> {
  return { data: await listActiveCategories(scope) };
}
