import type { Request, Response } from 'express';
import type {
  CreateStationTypeRequest,
  UpdateStationTypeRequest,
  CreateStationTagRequest,
  UpdateStationTagRequest,
  CreateCaptureCategoryRequest,
  UpdateCaptureCategoryRequest,
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  UpdateShiftExceptionRequest,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import {
  createStationType,
  editStationType,
  createStationTag,
  editStationTag,
  createCaptureCategory,
  editCaptureCategory,
} from '../application/metadata.js';
import { createManagedTemplate, editManagedTemplate } from '../application/templates.js';
import { editShiftException } from '../application/shifts.js';
import { readStructure } from '../application/read.js';
import { removeEventDay } from '../application/days.js';
import type { RemoveEventDayRequest } from '@spoh/shared';
export async function removeDayHandler(req: Request, res: Response) {
  res.json(
    await removeEventDay(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<RemoveEventDayRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}

export async function structureHandler(req: Request, res: Response) {
  res.json(await readStructure(scopeOf(req)));
}
export async function createTypeHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createStationType(validatedBody<CreateStationTypeRequest>(req), actorContextFrom(req)),
    );
}
export async function editTypeHandler(req: Request, res: Response) {
  res.json(
    await editStationType(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<UpdateStationTypeRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function createTagHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createStationTag(validatedBody<CreateStationTagRequest>(req), actorContextFrom(req)),
    );
}
export async function editTagHandler(req: Request, res: Response) {
  res.json(
    await editStationTag(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<UpdateStationTagRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function createCategoryHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createCaptureCategory(
        validatedBody<CreateCaptureCategoryRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function editCategoryHandler(req: Request, res: Response) {
  res.json(
    await editCaptureCategory(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<UpdateCaptureCategoryRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function createTemplateHandler(req: Request, res: Response) {
  res
    .status(201)
    .json(
      await createManagedTemplate(
        validatedBody<CreateManagedTemplateRequest>(req),
        actorContextFrom(req),
      ),
    );
}
export async function editTemplateHandler(req: Request, res: Response) {
  res.json(
    await editManagedTemplate(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<UpdateManagedTemplateRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
export async function editShiftHandler(req: Request, res: Response) {
  res.json(
    await editShiftException(
      {
        id: validatedParams<{ id: string }>(req).id,
        body: validatedBody<UpdateShiftExceptionRequest>(req),
      },
      actorContextFrom(req),
    ),
  );
}
