import type { Request, Response } from 'express';
import type {
  CreateVisitorFieldRequest,
  UpdateVisitorFieldRequest,
  VisitorRecordsQuery,
} from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import {
  createVisitorField,
  listVisitorFields,
  updateVisitorField,
} from '../application/fields.js';
import { readVisitorRecords } from '../application/readVisitorRecords.js';

export async function listVisitorFieldsHandler(req: Request, res: Response): Promise<void> {
  const fields = await listVisitorFields(scopeOf(req));
  res.status(200).json({ data: fields, meta: { count: fields.length, nextCursor: null } });
}

export async function createVisitorFieldHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<CreateVisitorFieldRequest>(req);
  res.status(201).json({ field: await createVisitorField(body, actorContextFrom(req)) });
}

export async function updateVisitorFieldHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const patch = validatedBody<UpdateVisitorFieldRequest>(req);
  res.status(200).json({ field: await updateVisitorField(id, patch, actorContextFrom(req)) });
}

/** The values the caller's role reads, in a window (the whole event by default). */
export async function readVisitorRecordsHandler(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<VisitorRecordsQuery>(req);
  const records = await readVisitorRecords(scopeOf(req), {
    role: getAuth(req).role,
    from: query.from ? new Date(query.from) : new Date(0),
    to: query.to ? new Date(query.to) : new Date(8.64e15),
  });
  // Personal data: never cached anywhere between here and the reader.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(records);
}
