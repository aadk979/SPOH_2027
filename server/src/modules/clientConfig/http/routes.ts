import { Router } from 'express';
import { defaultRateLimit } from '../../../platform/http/rateLimit.js';
import { readClientConfiguration } from '../application/readClientConfiguration.js';

/** Public bootstrap metadata (ADR-003 §5); no identity, operational data or secret. */
export const clientConfigRouter: Router = Router();
clientConfigRouter.get('/', defaultRateLimit, (_req, res) => {
  const configuration = readClientConfiguration();
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ data: configuration });
});
