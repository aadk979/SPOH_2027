import { pino, type Logger } from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

/**
 * Structured logging (BUILD_PLAN §8.7).
 *
 * The redaction list is the important part: an access token or an idempotency
 * key in a log line is a credential in a log line. `redact` is applied by pino
 * before serialisation, so a redacted path can never reach a transport.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'idempotencyKey',
  '*.password',
  '*.token',
  '*.idempotencyKey',
  'body.password',
  'body.idempotencyKey',
] as const;

export const logger: Logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: [...REDACTED_PATHS],
    censor: '[redacted]',
  },
  base: { service: 'spoh-server' },
  // Pretty output is a developer convenience only; deployed environments emit
  // newline-delimited JSON for CloudWatch.
  transport:
    isProduction || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});

/** A child logger bound to a request id, used by every request-scoped code path. */
export function requestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}
