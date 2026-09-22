import { multistream, pino, type Logger } from 'pino';
import { env, isProduction, isTest } from '../config/env.js';
import { shipLogLine } from './cloudwatch.js';

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
  'pin',
  '*.pin',
  'body.pin',
  'body.token',
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

/**
 * A tee to CloudWatch, used only when `CLOUDWATCH_SHIP_APP_LOGS` is on.
 *
 * It receives the line pino has already serialised and redacted, which is the
 * point: nothing reaches this stream that would not also reach stdout, so the
 * redaction list above governs both destinations with no second chance to get
 * it wrong. `shipLogLine` buffers and never throws, so a logging call cannot
 * fail a request.
 */
const cloudWatchTee = {
  write(line: string): void {
    shipLogLine(line.trimEnd());
  },
};

const destination =
  env.CLOUDWATCH_SHIP_APP_LOGS && !isTest
    ? multistream([{ stream: process.stdout }, { stream: cloudWatchTee }])
    : undefined;

export const logger: Logger = pino(
  {
    level: isTest ? 'silent' : env.LOG_LEVEL,
    redact: {
      paths: [...REDACTED_PATHS],
      censor: '[redacted]',
    },
    base: { service: 'spoh-server' },
    // Pretty output is a developer convenience only; deployed environments emit
    // newline-delimited JSON for CloudWatch. A transport and a multistream are
    // mutually exclusive, which is fine — shipping is a deployed-only concern.
    ...(destination
      ? {}
      : {
          transport:
            isProduction || isTest
              ? undefined
              : { target: 'pino-pretty', options: { colorize: true } },
        }),
  },
  destination,
);

/** A child logger bound to a request id, used by every request-scoped code path. */
export function requestLogger(requestId: string): Logger {
  return logger.child({ requestId });
}
