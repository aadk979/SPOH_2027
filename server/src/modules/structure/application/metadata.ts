import {
  ERROR_CODES,
  type CreateStationTypeRequest,
  type UpdateStationTypeRequest,
  type CreateStationTagRequest,
  type UpdateStationTagRequest,
  type CreateCaptureCategoryRequest,
  type UpdateCaptureCategoryRequest,
} from '@spoh/shared';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import * as repo from '../data/metadataRepo.js';
import { toCategoryRecord } from '../data/mappers.js';
import { mutateStructure, requireStructureChange } from './mutation.js';

export function createStationType(body: CreateStationTypeRequest, actor: ActorContext) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Change',
      key: body.idempotencyKey,
      auditAction: 'stationType.create',
    },
    async (tx) => {
      const data = await repo.createType(actor.scope, { tx, body });
      return { data, entityType: 'StationType', entityId: data.id, after: data };
    },
  );
}
export function editStationType(
  input: { id: string; body: UpdateStationTypeRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Edit',
      key: input.body.idempotencyKey,
      auditAction: 'stationType.update',
    },
    async (tx) => {
      const before = await repo.findType(actor.scope, { tx, id: input.id });
      if (!before) throw new NotFoundError('Station type');
      const capabilities = [
        'registersVisitors',
        'countsEntry',
        'issuesStamp',
        'redeemsGifts',
      ] as const;
      if (
        capabilities.some(
          (key) => input.body[key] !== undefined && input.body[key] !== before[key],
        ) ||
        (input.body.active === true && !before.active)
      )
        await requireStructureChange(actor, tx);
      if (
        input.body.active === false &&
        (await repo.activeTypeStations(actor.scope, { tx, id: input.id }))
      )
        throw new ConflictError(
          ERROR_CODES.CONFLICT,
          'Deactivate or move the active stations using this type first.',
        );
      const data = await repo.updateType(actor.scope, { tx, ...input });
      return { data, entityType: 'StationType', entityId: data.id, before, after: data };
    },
  );
}
export function createStationTag(body: CreateStationTagRequest, actor: ActorContext) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Change',
      key: body.idempotencyKey,
      auditAction: 'stationTag.create',
    },
    async (tx) => {
      const data = await repo.createTag(actor.scope, { tx, body });
      return { data, entityType: 'StationTag', entityId: data.id, after: data };
    },
  );
}
export function editStationTag(
  input: { id: string; body: UpdateStationTagRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Edit',
      key: input.body.idempotencyKey,
      auditAction: 'stationTag.update',
    },
    async (tx) => {
      const before = await repo.findTag(actor.scope, { tx, id: input.id });
      if (!before) throw new NotFoundError('Station tag');
      const data = await repo.updateTag(actor.scope, { tx, ...input });
      return { data, entityType: 'StationTag', entityId: data.id, before, after: data };
    },
  );
}
export function createCaptureCategory(body: CreateCaptureCategoryRequest, actor: ActorContext) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Change',
      key: body.idempotencyKey,
      auditAction: 'captureCategory.create',
    },
    async (tx) => {
      const data = toCategoryRecord(await repo.createCategory(actor.scope, { tx, body }));
      return { data, entityType: 'CaptureCategory', entityId: data.id, after: data };
    },
  );
}
export function editCaptureCategory(
  input: { id: string; body: UpdateCaptureCategoryRequest },
  actor: ActorContext,
) {
  return mutateStructure(
    {
      actor,
      action: 'Structure.Edit',
      key: input.body.idempotencyKey,
      auditAction: 'captureCategory.update',
    },
    async (tx) => {
      const row = await repo.findCategory(actor.scope, { tx, id: input.id });
      if (!row) throw new NotFoundError('Visitor category');
      const before = toCategoryRecord(row);
      const data = toCategoryRecord(await repo.updateCategory(actor.scope, { tx, ...input }));
      return { data, entityType: 'CaptureCategory', entityId: data.id, before, after: data };
    },
  );
}
