import type { Request, Response } from 'express';
import { logger } from '../../../platform/logger/index.js';
import { checkReadiness } from '../application/readiness.js';
import { cacheBusStatus } from '../../../platform/events/cacheBus.js';

export function livenessHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}

export async function readinessHandler(req: Request, res: Response): Promise<void> {
  try {
    await checkReadiness();
    res.status(200).json({ status: 'ready', bus: cacheBusStatus() });
  } catch (error) {
    logger.error({ err: error, requestId: req.id }, 'readiness check failed');
    res.status(503).json({ status: 'not_ready' });
  }
}
