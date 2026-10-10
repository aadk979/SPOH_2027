import type {
  ChangeRolePermissionRequest,
  ReviewRolePermissionsRequest,
  SimulatePermissionRequest,
} from '@spoh/shared';
import type { Request, Response } from 'express';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { askEach } from '../../../platform/http/authorize.js';
import { getAuth, scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody, validatedParams } from '../../../platform/http/validate.js';
import { changeRolePermission } from '../application/changeRolePermission.js';
import { readRolePermissions } from '../application/readRolePermissions.js';
import { reviewRolePermissions } from '../application/reviewRolePermissions.js';
import { readCurrentRolePermissions } from '../application/readCurrentRolePermissions.js';
import type { RedactedReplay } from '../../../platform/http/idempotency.js';
import { readMemberPermissions, simulatePermission } from '../application/simulatePermission.js';

export async function readRolePermissionsHandler(req: Request, res: Response): Promise<void> {
  const [edit] = await askEach(req, [
    { action: 'Permissions.Edit', resource: { type: 'Event', id: getAuth(req).eventId } },
  ]);
  const data = await readRolePermissions(scopeOf(req), { canEdit: edit?.allowed === true });
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ data });
}

export async function changeRolePermissionHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<ChangeRolePermissionRequest>(req);
  res.status(200).json({ data: await changeRolePermission(body, actorContextFrom(req)) });
}

export async function reviewRolePermissionsHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const body = validatedBody<ReviewRolePermissionsRequest>(req);
  res.status(200).json({ data: await reviewRolePermissions(body, actorContextFrom(req)) });
}

export const permissionReviewReplay: RedactedReplay = {
  store() {
    return { reviewed: true };
  },
  async replay(req) {
    return { data: await readCurrentRolePermissions(actorContextFrom(req)) };
  },
};

export async function simulatePermissionHandler(req: Request, res: Response): Promise<void> {
  const body = validatedBody<SimulatePermissionRequest>(req);
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ data: await simulatePermission(scopeOf(req), body) });
}

export async function readMemberPermissionsHandler(req: Request, res: Response): Promise<void> {
  const { personId } = validatedParams<{ personId: string }>(req);
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ data: await readMemberPermissions(scopeOf(req), personId) });
}
