import { ERROR_CODES } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import {
  captureProvenance,
  type CaptureProvenance,
} from '../../../platform/db/captureProvenance.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../platform/errors/index.js';
import { findWindow } from '../data/repo.js';

export interface ImportProvenance extends CaptureProvenance {
  fallbackWindowId?: string;
}

/** Only a window in this event can supply historical practice provenance. */
export async function resolveImportProvenance(
  scope: EventScope,
  request: { source: 'PAPER' | 'FALLBACK_SHEET'; fallbackWindowId?: string; rehearsal?: boolean },
): Promise<ImportProvenance> {
  if (!request.fallbackWindowId) return captureProvenance(prisma, scope, request);
  const window = await findWindow(prisma, scope, request.fallbackWindowId);
  if (!window) throw new NotFoundError('Fallback window');
  if (window.tier !== (request.source === 'PAPER' ? 4 : 3)) {
    throw new ValidationError('The import source must match the fallback window.');
  }
  if (request.rehearsal !== undefined && request.rehearsal !== window.rehearsal) {
    throw new ValidationError('The import mode must match the fallback window.');
  }
  return { rehearsal: window.rehearsal, fallbackWindowId: window.id };
}

/** A lifecycle change between preview and commit must not silently relabel the sheet. */
export async function assertImportProvenance(
  tx: PrismaTransactionClient,
  scope: EventScope,
  provenance: ImportProvenance,
): Promise<void> {
  if (provenance.fallbackWindowId) return;
  const current = await captureProvenance(tx, scope);
  if (current.rehearsal !== provenance.rehearsal) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event phase changed. Preview the import again.',
    );
  }
}

/** Preserve legacy live keys; practice sheets must never collide with them. */
export function importBatchScope(
  scope: EventScope,
  input: ImportProvenance & { fileName?: string },
) {
  if (!input.rehearsal) return input.fileName ?? 'manual';
  return `${scope.eventId}:rehearsal:${input.fileName ?? 'manual'}`;
}
