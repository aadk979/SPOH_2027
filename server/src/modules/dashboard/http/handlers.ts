import type { Request, Response } from 'express';
import type { RehearsalInclusionQuery } from '@spoh/shared';
import { validatedParams, validatedQuery } from '../../../platform/http/validate.js';
import { getDataHealth } from '../application/getDataHealth.js';
import { getLiveDashboard } from '../application/getLiveDashboard.js';
import { getStationDashboard } from '../application/getStationDashboard.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { dashboardReader } from '../application/readContext.js';

function readerFor(req: Request) {
  const auth = getAuth(req);
  return dashboardReader({ scope: scopeOf(req), personId: auth.volunteerId,
    membershipId: auth.membershipId, ip: req.ip ?? null });
}

export async function liveDashboardHandler(req: Request, res: Response): Promise<void> {
  const reader = readerFor(req);
  res
    .status(200)
    .json(
      await getLiveDashboard({ ...scopeOf(req), ...validatedQuery<RehearsalInclusionQuery>(req) }, reader.now, reader),
    );
}

export async function dataHealthHandler(req: Request, res: Response): Promise<void> {
  const reader = readerFor(req);
  res
    .status(200)
    .json(
      await getDataHealth({ ...scopeOf(req), ...validatedQuery<RehearsalInclusionQuery>(req) }, reader.now, { reader }),
    );
}

export async function stationDashboardHandler(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<{ id: string }>(req);
  const reader = readerFor(req);
  res
    .status(200)
    .json(
      await getStationDashboard(
        { ...scopeOf(req), ...validatedQuery<RehearsalInclusionQuery>(req) },
        id,
        { now: reader.now, reader },
      ),
    );
}
