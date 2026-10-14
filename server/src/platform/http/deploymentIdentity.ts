import type { RequestHandler } from 'express';
import { env } from '../../config/env.js';

/** Native smoke binds every response to the immutable image selected in this task definition. */
export const deploymentIdentity: RequestHandler = (_request, response, next) => {
  if (env.READINESS_CLOUD_CONFIG) {
    response.setHeader('X-SPOH-Deployment', env.READINESS_CLOUD_CONFIG.deploymentId);
  }
  next();
};
