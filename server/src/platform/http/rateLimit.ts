import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { requestIdOf } from './requestId.js';
import { named } from './named.js';
import { DynamicRateLimitStore } from './dynamicRateLimitStore.js';
import { rateLimitPolicy, type RateLimitPolicy, type RateLimitTier } from './rateLimitPolicy.js';

/** A person gets their own bucket; anonymous routes use a normalised IP. */
function subjectKey(req: Request): string {
  const sub = req.auth?.sub ?? req.person?.sub;
  if (sub) return `sub:${sub}`;
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

type ScopedLimiter = RequestHandler & { resetKey: (subject: string) => void };

function build(tier: RateLimitTier, extra: Partial<Options> = {}): ScopedLimiter {
  const policies = new WeakMap<Request, RateLimitPolicy>();
  const store = new DynamicRateLimitStore();
  const policyOf = (req: Request): RateLimitPolicy => {
    const policy = policies.get(req);
    if (!policy) throw new Error('Rate limit policy was not loaded');
    return policy;
  };
  const limiter = rateLimit({
    // The store returns the actual reset time from the live window setting.
    windowMs: 60_000,
    limit: (req) => policyOf(req).max,
    keyGenerator: (req) => {
      const policy = policyOf(req);
      return `w=${policy.windowSeconds}|o=${policy.organisationId ?? 'unconfigured'}|${subjectKey(req)}`;
    },
    identifier: (req) => `${tier}-${policyOf(req).windowSeconds}s`,
    store,
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
  const handler: RequestHandler = async (req, res, next) => {
    try {
      policies.set(req, await rateLimitPolicy(req, tier));
      await limiter(req, res, next);
    } catch (error) {
      next(error);
    }
  };
  return Object.assign(handler, { resetKey: (subject: string) => store.resetSubject(subject) });
}

/** Ordinary reads and writes. */
export const defaultRateLimit = named('defaultRateLimit', build('default'));

/** Capture requests have a high ceiling so taps are not lost at a busy booth. */
export const captureRateLimit = named('captureRateLimit', build('capture'));

/** Credential minting, imports and whole-event reports. */
export const sensitiveRateLimit = named('sensitiveRateLimit', build('sensitive'));

/** A shared IP is charged only for failed sign-ins (F04-006). */
export const signInRateLimit = named(
  'signInRateLimit',
  build('sensitive', { skipSuccessfulRequests: true }),
);

/** Privileged writes, below the ordinary ceiling. */
export const adminRateLimit = named('adminRateLimit', build('admin'));
