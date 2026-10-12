import type { Request, Response } from 'express';
import type { EntityRef, RecordsRequest, SearchRequest } from '@spoh/shared';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedQuery } from '../../../platform/http/validate.js';
import { withCurrentRead } from '../../../platform/access/transactionRead.js';
import { systemClock } from '../../../platform/time/index.js';
import { named } from '../../../platform/http/named.js';
import { readEntity, readRecords, searchWorkspace, type WorkspaceSources } from '../application/readWorkspace.js';

function readIdentity(req: Request) {
  const auth = getAuth(req);
  return { scope: scopeOf(req), personId: auth.volunteerId, membershipId: auth.membershipId,
    now: systemClock.now(), ip: req.ip ?? null };
}
export function workspaceHandlers(sources: WorkspaceSources) {
  return {
    entity: named('authorize(Entity.Read)', async (req: Request, res: Response) => {
      res.json(await withCurrentRead(readIdentity(req), (context) => readEntity(context, { ref: validatedQuery<EntityRef>(req), sources })));
    }),
    records: named('authorize(Records.Read)', async (req: Request, res: Response) => {
      res.json(await withCurrentRead(readIdentity(req), (context) => readRecords(context, { request: validatedQuery<RecordsRequest>(req), sources })));
    }),
    search: named('authorize(Workspace.Search)', async (req: Request, res: Response) => {
      res.json(await withCurrentRead(readIdentity(req), (context) => searchWorkspace(context, { query: validatedQuery<SearchRequest>(req), sources })));
    }),
  };
}
