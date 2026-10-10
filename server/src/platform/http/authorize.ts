import {
  ACTION_CATALOGUE,
  ACTION_IDS,
  EDITABLE_ACTION_IDS,
  type Action,
  type Role,
} from '@spoh/access-policies';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  databaseRoleGrants,
  EntityBuilder,
  type Question,
  type ResourceRef,
} from '../access/authorizer/index.js';
import { currentAuthorizer, USE_CASE_PHASE_GUARDRAILS } from '../access/engine.js';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { ERROR_CODES } from '@spoh/shared';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  StationScopeError,
} from '../errors/index.js';
import { hasSettledAnswer } from '../idempotency/index.js';
import { logger } from '../logger/index.js';
import { systemClock } from '../time/index.js';
import { recordDenial } from './authorizationDenials.js';
import { countOutcome, startDecisionSummary } from './decisionTally.js';
import { named } from './named.js';
import { getAuth } from './requireAuth.js';

/**
 * Cedar enforcement points (ADR-005, P11.5): every route that runs inside a membership asks
 * the policies, and their answer decides. A denial is a 403, recorded in the security audit
 * with the policies that decided it. A resource the request names but that does not exist
 * answers as the route always did (404, 400); an evaluation that cannot finish fails closed
 * with a 503, never a 403, because the caller may well be allowed.
 */

/** A row of `packages/access-policies/CHANGES.md`: a deliberate difference from today. */
export type ChangeId =
  | 'C1'
  | 'C2'
  | 'C3'
  | 'C4'
  | 'C5'
  | 'C6'
  | 'C7'
  | 'C9'
  | 'C11'
  | 'C12'
  | 'C13'
  | 'C14'
  | 'C15'
  | 'C16';

/** One question; a platform action is asked as the person rather than the membership. */
export interface Check extends Question {
  readonly asPerson?: boolean;
}

export type ResourceOf = (req: Request) => ResourceRef | Promise<ResourceRef>;
export type ChecksOf = (req: Request) => readonly Check[] | Promise<readonly Check[]>;

export interface AuthorizeOptions {
  /** The `CHANGES.md` rows that changed this route's answer from the capability matrix's. */
  readonly changes?: readonly ChangeId[];
  /**
   * Allowed when any one question is (a collection read, asked of candidate resources)
   * rather than all of them.
   */
  readonly any?: boolean;
}

export interface CheckResult {
  readonly action: Action;
  readonly allowed: boolean;
  readonly policies: readonly string[];
  readonly errors: readonly string[];
}

export type Outcome =
  | { readonly kind: 'decided'; readonly allowed: boolean; readonly checks: readonly CheckResult[] }
  | { readonly kind: 'unaskable' }
  | { readonly kind: 'failed'; readonly cause: unknown };

/** For tests: the engine the enforcement points ask. */
export { useAuthorizer } from '../access/engine.js';

/**
 * UI affordances (ADR-005 §6, P11.8): each question answered on its own by the local engine,
 * from the same policies the enforcement points use. The server still decides every action.
 */
export async function askEach(
  req: Request,
  checks: readonly Check[],
): Promise<readonly CheckResult[]> {
  const outcome = await decide(req, () => checks, false);
  return outcome.kind === 'decided' ? outcome.checks : [];
}

/** May the caller take `action` on the resource the request names? */
export function authorize(
  action: Action,
  resource: ResourceOf,
  options: AuthorizeOptions = {},
): RequestHandler {
  return authorizeAll(action, async (req) => [{ action, resource: await resource(req) }], options);
}

/**
 * Several questions, all of which must be allowed: a request that touches several resources.
 * `name` is the action when the questions all ask one; a request with nothing to ask falls
 * back to it (see `nothingToAsk`).
 */
export function authorizeAll(
  name: string,
  checks: ChecksOf,
  options: AuthorizeOptions = {},
): RequestHandler {
  const point: EnforcementPoint = { name, checks, options };
  return named(`authorize(${name})`, (req: Request, res: Response, next: NextFunction): void => {
    enforce(req, res, point).then(() => next(), next);
  });
}

interface EnforcementPoint {
  readonly name: string;
  readonly checks: ChecksOf;
  readonly options: AuthorizeOptions;
}

async function enforce(req: Request, res: Response, point: EnforcementPoint): Promise<void> {
  const outcome = await decide(req, point.checks, point.options.any ?? false).catch(
    (cause: unknown): Outcome => ({ kind: 'failed', cause }),
  );
  res.locals.authorization = outcome;
  startDecisionSummary((tally) => logger.info({ authorization: tally }, 'authorization summary'));
  if (outcome.kind === 'failed') {
    countOutcome('failed');
    throw failure(req, outcome.cause);
  }
  if (outcome.kind === 'unaskable') {
    countOutcome('unaskable');
    if (await nothingToAsk(req, point.name)) return;
    throw refuse(req, { actions: [point.name], policies: [] }, forbidden());
  }
  if (outcome.allowed) {
    countOutcome('allowed');
    return;
  }
  const refused = outcome.checks.filter((check) => !check.allowed);
  const policies = [...new Set(refused.flatMap((check) => check.policies))];
  if (await passesToUseCase(req, refused)) {
    countOutcome('allowed');
    watchPhaseHandover(req, res, policies);
    return;
  }
  countOutcome('denied');
  throw refuse(
    req,
    { actions: refused.map((check) => check.action), policies },
    refusalFor(refused, policies),
  );
}

function refuse(
  req: Request,
  denial: { readonly actions: readonly string[]; readonly policies: readonly string[] },
  error: AppError,
): AppError {
  recordDenial(req, { route: routeOf(req), path: patternOf(req), ...denial });
  return error;
}

const forbidden = () => new ForbiddenError('You do not have permission to perform this action');

/**
 * A request refused only by `USE_CASE_PHASE_GUARDRAILS` goes on to its use case, which refuses
 * it with the reason the screens show: the middleware's answer can race go-live, and its
 * capture window is coarser than the admission's. Structure frozen once LIVE has no such
 * check, so the policy's answer stands (C15).
 */
const STRUCTURE_FROZEN = 'guardrail.structure-frozen-when-live';

const refusedOnlyBy = (refused: readonly CheckResult[], guardrails: ReadonlySet<string>) =>
  refused.length > 0 &&
  refused.every(
    (check) =>
      check.policies.length > 0 && check.policies.every((policy) => guardrails.has(policy)),
  );

async function passesToUseCase(req: Request, refused: readonly CheckResult[]): Promise<boolean> {
  if (refusedOnlyBy(refused, USE_CASE_PHASE_GUARDRAILS)) return true;
  // The caller's retry of a structure change already answered before go-live: the
  // idempotency middleware replays the stored answer, which was decided when it was made.
  const phase = new Set([...USE_CASE_PHASE_GUARDRAILS, STRUCTURE_FROZEN]);
  return refusedOnlyBy(refused, phase) && (await isSettledReplay(req));
}

async function isSettledReplay(req: Request): Promise<boolean> {
  const key: unknown = (req.body as { idempotencyKey?: unknown } | undefined)?.idempotencyKey;
  if (typeof key !== 'string' || key.length === 0) return false;
  const { sub, eventId } = getAuth(req);
  return hasSettledAnswer(key, { actorSub: sub, eventId });
}

/**
 * A use case is the second check on the event's phase; if one ever lets through a write the
 * phase guardrail refused, that is a missing check, and the log says so (an error, so the
 * environment's alarms see it).
 */
function watchPhaseHandover(req: Request, res: Response, policies: readonly string[]): void {
  res.once('finish', () => {
    if (res.statusCode >= 400 || res.locals.idempotentReplay === true) return;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    logger.error(
      { authorization: { route: routeOf(req), status: res.statusCode, policies } },
      'phase guardrail not enforced by the use case',
    );
  });
}

/**
 * The refusal the screens can explain, from the policies that decided it: yourself, a rank at
 * or above your own, a station you are not on shift at, or an event whose structure is frozen.
 * Anything else is the generic refusal.
 */
function refusalFor(refused: readonly CheckResult[], policies: readonly string[]): AppError {
  if (policies.includes('guardrail.not-on-yourself')) {
    return new AppError(
      403,
      ERROR_CODES.SELF_MUTATION_DENIED,
      'You cannot change your own account. Ask another administrator.',
    );
  }
  if (policies.includes('guardrail.outrank-target')) {
    return new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot change an account at or above your own level.',
    );
  }
  if (policies.includes('guardrail.grant-below-own-rank')) {
    return new AppError(
      403,
      ERROR_CODES.ROLE_ESCALATION_DENIED,
      'You cannot grant a role at or above your own.',
    );
  }
  // Reopening is the platform admins' (C13); the transition's own answer names it as the
  // blocker, which the lifecycle screen explains.
  if (
    refused.every((check) => check.action === 'Event.Reopen') &&
    refusedOnlyBy(refused, new Set(['guardrail.locked-actions']))
  ) {
    return new ConflictError(ERROR_CODES.CONFLICT, 'The event cannot make this transition.', {
      blockers: ['platform-admin-required'],
    });
  }
  if (refusedOnlyBy(refused, new Set([STRUCTURE_FROZEN]))) {
    return new ConflictError(
      ERROR_CODES.CONFLICT,
      'The event is live: stations, event days, gift types and visitor fields can no longer be added.',
    );
  }
  if (policies.includes('station-scope.capture')) return new StationScopeError();
  // The inbox shows only what is addressed to you; anything else does not exist for you.
  if (refused.every((check) => check.action === 'Announcement.Ack')) {
    return new NotFoundError('Announcement');
  }
  return forbidden();
}

async function grantedToCaller(req: Request): Promise<readonly string[]> {
  const { eventId, membershipId } = getAuth(req);
  const member = await prisma.eventMembership.findFirst({
    where: { eventId, id: membershipId },
    select: { role: true },
  });
  if (!member) return [];
  const grants = await databaseRoleGrants.grantsFor(prisma, eventId);
  return grants[member.role as Role].grants;
}

/**
 * A collection read with no candidate to ask about (an empty swap queue, a day that is not an
 * event day, an event without stations) answers with the role's standing permission: an
 * Editable action when this event grants it to the caller's role, a self-service action to
 * every member. The use case then finds nothing to show, or says why.
 */
async function nothingToAsk(req: Request, name: string): Promise<boolean> {
  if (!(ACTION_IDS as readonly string[]).includes(name)) return false;
  const action = name as Action;
  if ((ACTION_CATALOGUE[action].groups as readonly string[]).includes('Self')) return true;
  if (!(EDITABLE_ACTION_IDS as readonly string[]).includes(action)) return false;
  return (await grantedToCaller(req)).includes(action);
}

/**
 * The resource the request names does not exist, or the request does not name one: the
 * route's own answer (404, 400). Anything else stopped the policies from answering, which
 * says nothing about the caller, so it fails closed without blaming them (ADR-005 §6).
 */
function failure(req: Request, cause: unknown): AppError {
  if (cause instanceof AppError && cause.statusCode < 500) return cause;
  logger.error({ err: cause, route: routeOf(req) }, 'authorization evaluation failed');
  return new ServiceUnavailableError('Permissions could not be checked. Try again shortly.', cause);
}

/**
 * The policies' reads are plain queries, apart from the request's own. Not an interactive
 * transaction: under READ COMMITTED each statement has
 * its own snapshot anyway, so one bought no consistency, while it held a connection
 * through the Cedar evaluation and gave up after Prisma's 2 s wait for one. A cold pool
 * on staging took about 3 s to open connections, and the shadow check was the only
 * thing on those requests to fail (P11.5 release 2a, 9 October 2026).
 */
async function decide(req: Request, checks: ChecksOf, any: boolean): Promise<Outcome> {
  const db: PrismaTransactionClient = prisma;
  const auth = getAuth(req);
  const recordedAt = clientRecordedAt(req);
  const builder = new EntityBuilder(db, {
    eventId: auth.eventId,
    now: systemClock.now(),
    ...(recordedAt ? { clientRecordedAt: recordedAt } : {}),
  });
  const questions = await checks(req);
  if (questions.length === 0) return { kind: 'unaskable' };
  const results: CheckResult[] = [];
  for (const check of questions) {
    const question: Question = {
      ...check,
      facts: { ip: req.ip ?? null, lateSyncAllowed: recordedAt !== undefined, ...check.facts },
    };
    const request = check.asPerson
      ? await builder.forPerson(auth.volunteerId, question)
      : await builder.forMembership(auth.membershipId, question);
    const decision = await currentAuthorizer().isAuthorized(request);
    results.push({
      action: check.action,
      allowed: decision.allowed && decision.errors.length === 0,
      policies: decision.determiningPolicies,
      errors: decision.errors,
    });
  }
  const allowed = any ? results.some((r) => r.allowed) : results.every((r) => r.allowed);
  return { kind: 'decided', allowed, checks: results };
}

/** A queued capture's recorded time, which the policies judge a CLOSED late sync by. */
function clientRecordedAt(req: Request): Date | undefined {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>).clientRecordedAt;
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** The route's pattern, with the event a path names written as `:eventId`. */
function routeOf(req: Request): string {
  return `${req.method} ${patternOf(req)}`;
}

function patternOf(req: Request): string {
  const base = req.baseUrl.replace(/\/events\/[^/]+/, '/events/:eventId');
  const sub = (req.route as { path?: string } | undefined)?.path ?? '';
  return sub === '/' ? base : `${base}${sub}`;
}
