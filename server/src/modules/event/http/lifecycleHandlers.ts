import type { Request, Response } from 'express';
import type { TransitionEventRequest } from '@spoh/shared';
import { actorContextFrom } from '../../../platform/http/auditContext.js';
import { scopeOf } from '../../../platform/http/requireAuth.js';
import { validatedBody } from '../../../platform/http/validate.js';
import { readLifecycle } from '../application/readLifecycle.js';
import { transitionEvent } from '../application/transitionEvent.js';
import { readLifecycleReadiness } from '../application/readLifecycleReadiness.js';

export async function readLifecycleHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json(await readLifecycle(scopeOf(req)));
}
export async function readLifecycleReadinessHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(await readLifecycleReadiness(actorContextFrom(req)));
}
export async function transitionEventHandler(req: Request, res: Response): Promise<void> {
  res
    .status(200)
    .json(await transitionEvent(validatedBody<TransitionEventRequest>(req), actorContextFrom(req)));
}
