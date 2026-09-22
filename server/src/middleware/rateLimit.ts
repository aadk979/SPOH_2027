import { ipKeyGenerator, rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { env } from '../config/env.js';
import { requestIdOf } from './requestId.js';
import { auditRefusal } from './securityAudit.js';

/**
 * Rate limiting (BUILD_PLAN §8.4).
 *
 * Keyed on the authenticated subject where there is one, falling back to IP.
 * Keying on IP alone would be wrong at this event: a whole station of
 * volunteers can share one Wi-Fi egress, and one busy booth would throttle the
 * rest of the room.
 *
 * The capture ceiling is deliberately high. A booth volunteer at peak genuinely
 * taps fast, and a throttled tap is a visitor who never gets counted — the
 * limiter exists to stop abuse, not to second-guess the queue.
 */
function keyGenerator(req: Request): string {
  const sub = req.auth?.sub;
  if (sub) return `sub:${sub}`;
  // ipKeyGenerator normalises IPv6 to a /56 block so a single client cannot
  // trivially rotate addresses within its own prefix.
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

function build(max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: max,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      // This handler answers the request itself rather than throwing, so the
      // error handler never sees it — the audit call has to happen here.
      auditRefusal(req, 429, ERROR_CODES.RATE_LIMITED);

      res.status(429).json({
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests. Slow down and try again shortly.',
          requestId: requestIdOf(req),
        },
      });
    },
  });
}

/** Everything that is not a capture write or an auth-adjacent action. */
export const defaultRateLimit = build(env.RATE_LIMIT_MAX_DEFAULT);

/** Registration taps and footfall ticks. */
export const captureRateLimit = build(env.RATE_LIMIT_MAX_CAPTURE);

/**
 * Anything that mints a credential, sends an email, or reads the whole event.
 *
 * Provisioning, roster and fallback imports, report generation, sign-in. Kept
 * deliberately tight: these are slow, and none of them is something a human
 * does twenty times a minute.
 */
export const sensitiveRateLimit = build(env.RATE_LIMIT_MAX_SENSITIVE);

/**
 * Administration writes.
 *
 * Between the two. Editing a volunteer or a station is privileged but cheap,
 * and it comes in bursts — configuring eight stations and four event days
 * before a dry run is one sitting, not an attack. The sensitive ceiling would
 * stop an admin halfway through and look like a broken screen; the default
 * ceiling is looser than a privileged write deserves.
 */
export const adminRateLimit = build(env.RATE_LIMIT_MAX_ADMIN);
