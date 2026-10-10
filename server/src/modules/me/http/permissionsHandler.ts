import type { Role } from '@spoh/access-policies';
import type { Request, Response } from 'express';
import { getAuth } from '../../../platform/http/requireAuth.js';
import { readMyPermissions } from '../application/readMyPermissions.js';

/** What the caller may do in this event, for the screens (P11.8, ADR-005 §6). */
export async function myPermissionsHandler(req: Request, res: Response): Promise<void> {
  const { eventId, membershipId, role } = getAuth(req);
  const body = await readMyPermissions(
    { eventId },
    { membershipId, role: role as Role, ip: req.ip ?? null },
  );
  res.set('Cache-Control', 'no-store');
  res.status(200).json(body);
}
