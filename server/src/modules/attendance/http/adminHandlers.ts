import type { Request, Response } from 'express';
import type { ChangeAttendanceConfigRequest, TestAttendanceNetworkRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { attendanceConfig } from '../application/attendanceConfig.js';
import { changeAttendanceConfig } from '../application/changeAttendanceConfig.js';
import { testAttendanceNetwork } from '../application/testAttendanceNetwork.js';

export async function getAttendanceConfigHandler(req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json(await attendanceConfig(scopeOf(req)));
}

export async function changeAttendanceConfigHandler(req: Request, res: Response): Promise<void> {
  const change = validatedBody<ChangeAttendanceConfigRequest>(req);
  res.set('Cache-Control', 'no-store');
  res.json(await changeAttendanceConfig(change, actorContextFrom(req)));
}

export function testAttendanceNetworkHandler(req: Request, res: Response): void {
  const { cidrs } = validatedBody<TestAttendanceNetworkRequest>(req);
  res.set('Cache-Control', 'no-store');
  res.json(testAttendanceNetwork(req.ip, cidrs));
}
