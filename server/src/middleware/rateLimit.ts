import {
  ipKeyGenerator,
  rateLimit,
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import type { Request } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { env } from '../config/env.js';
import { requestIdOf } from './requestId.js';
import { named } from '../lib/named.js';

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

function build(max: number, extra: Partial<Options> = {}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: max,
    keyGenerator,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: 'Too many requests. Slow down and try again shortly.',
          requestId: requestIdOf(req),
        },
      });
    },
    ...extra,
  });
}

/** Everything that is not a capture write or an auth-adjacent action. */
export const defaultRateLimit = named('defaultRateLimit', build(env.RATE_LIMIT_MAX_DEFAULT));

/** Registration taps and footfall ticks. */
export const captureRateLimit = named('captureRateLimit', build(env.RATE_LIMIT_MAX_CAPTURE));

/**
 * Anything that mints a credential, sends an email, or reads the whole event.
 *
 * Provisioning, roster and fallback imports, report generation. Kept
 * deliberately tight: these are slow, and none of them is something a human
 * does twenty times a minute.
 */
export const sensitiveRateLimit = named('sensitiveRateLimit', build(env.RATE_LIMIT_MAX_SENSITIVE));

/**
 * Sign-in: `POST /auth/session`, `GET /auth/login` and `GET /auth/callback`.
 *
 * Counts failures only (F04-006). Before sign-in there is no subject, so the
 * key is the IP, and a room of volunteers told to sign in at a briefing shares
 * one campus egress: on the sensitive ceiling, counting every request, the
 * 21st person in a minute was refused and retries kept the bucket full. A
 * successful sign-in costs nothing here; twenty failures a minute from one
 * address still stop a password-guessing loop.
 */
export const signInRateLimit = named(
  'signInRateLimit',
  build(env.RATE_LIMIT_MAX_SENSITIVE, { skipSuccessfulRequests: true }),
);

/**
 * Administration writes.
 *
 * Between the two. Editing a volunteer or a station is privileged but cheap,
 * and it comes in bursts — configuring eight stations and four event days
 * before a dry run is one sitting, not an attack. The sensitive ceiling would
 * stop an admin halfway through and look like a broken screen; the default
 * ceiling is looser than a privileged write deserves.
 */
export const adminRateLimit = named('adminRateLimit', build(env.RATE_LIMIT_MAX_ADMIN));
