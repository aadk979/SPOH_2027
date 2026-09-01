import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProduction } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestId } from './middleware/requestId.js';
import { healthRouter } from './modules/health/router.js';
import { apiRouter } from './routes.js';

/**
 * Express application factory.
 *
 * Returns the app without listening, so integration tests can drive it through
 * Supertest without binding a port (BUILD_PLAN §2 repo layout).
 */
export function createApp(): Express {
  const app = express();

  // Behind App Runner or an ALB the client IP arrives in X-Forwarded-For. Set
  // explicitly from config rather than `true`: trusting every hop lets a client
  // spoof its own address and defeat IP-keyed rate limiting (BUILD_PLAN §8.4).
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here costs nothing and the
      // client's own CSP is configured in next.config.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      // Exact allowlist. No wildcard, and the Origin header is never reflected
      // back unchecked (BUILD_PLAN §8.2).
      origin: (origin, callback) => {
        // Same-origin and non-browser callers send no Origin at all.
        if (!origin) return callback(null, true);
        callback(null, env.CORS_ALLOWED_ORIGINS.includes(origin));
      },
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? 'unknown',
      // Health checks fire every few seconds and would otherwise dominate the log.
      autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/readyz' },
    }),
  );

  // 100kb is generous for the largest capture payload (a group registration)
  // and small enough that a malformed client cannot push megabytes at the API.
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
