import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { ERROR_CODES } from '@spoh/shared';
import { requestIdOf } from './requestId.js';
import { named } from './named.js';
import { DynamicRateLimitStore } from './dynamicRateLimitStore.js';
import { rateLimitPolicy, type RateLimitPolicy, type RateLimitTier } from './rateLimitPolicy.js';
import { ServiceUnavailableError } from '../errors/index.js';
import { quotaKey } from './quotaKeys.js';
import type { QuotaNamespace } from './quotaCounterRepo.js';
import { withSuccessfulQuotaRefund } from './quotaRequestCharge.js';

/** A person gets their own bucket; anonymous routes use a normalised IP. */
function subjectKey(req: Request): string {
  const sub = req.auth?.sub ?? req.person?.sub;
  if (sub) return `sub:${sub}`;
  return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
}

type ScopedLimiter = RequestHandler & { resetKey: (subject: string) => Promise<void> };

function keyFor(req: Request, namespace: QuotaNamespace, policy: RateLimitPolicy) {
  return quotaKey({ namespace, scope: [policy.organisationId ?? 'unconfigured', policy.windowSeconds],
    subject: subjectKey(req), windowSeconds: policy.windowSeconds });
}

function configuredLimiter(input: {
  tier: RateLimitTier; namespace: QuotaNamespace; store: DynamicRateLimitStore;
  policyOf: (req: Request) => RateLimitPolicy;
}) {
  return rateLimit({
    // The store returns the actual reset time from the live window setting.
    windowMs: 60_000,
    limit: (req) => input.policyOf(req).max,
    keyGenerator: (req) => keyFor(req, input.namespace, input.policyOf(req)),
    identifier: (req) => `${input.tier}-${input.policyOf(req).windowSeconds}s`,
    store: input.store,
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
    // Successful sign-ins are refunded by our bound finish callback, with a generation.
    skipSuccessfulRequests: false,
  });
}

function build(tier: RateLimitTier, failedOnly = false): ScopedLimiter {
  const policies = new WeakMap<Request, RateLimitPolicy>();
  const namespace: QuotaNamespace = failedOnly ? 'http.sign-in-failure' : `http.${tier}`;
  const store = new DynamicRateLimitStore(namespace);
  const policyOf = (req: Request): RateLimitPolicy => {
    const policy = policies.get(req);
    if (!policy) throw new Error('Rate limit policy was not loaded');
    return policy;
  };
  const limiter = configuredLimiter({ tier, namespace, store, policyOf });
  const handler: RequestHandler = async (req, res, next) => {
    try {
      policies.set(req, await rateLimitPolicy(req, tier));
      const run = () => limiter(req, res, (error) => next(error
        ? new ServiceUnavailableError('Request quota temporarily unavailable', error) : undefined));
      if (failedOnly) {
        const key = keyFor(req, namespace, policyOf(req));
        await withSuccessfulQuotaRefund({ key, res, refund: (charge) => store.refund(charge) }, run);
      } else await run();
    } catch (error) {
      next(new ServiceUnavailableError('Request quota temporarily unavailable', error));
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
  build('sensitive', true),
);

/** Privileged writes, below the ordinary ceiling. */
export const adminRateLimit = named('adminRateLimit', build('admin'));
