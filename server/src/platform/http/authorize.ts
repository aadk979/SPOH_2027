import type { Action } from '@spoh/access-policies';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  EntityBuilder,
  LocalCedarAuthorizer,
  type Authorizer,
  type Question,
  type ResourceRef,
} from '../access/authorizer/index.js';
import { prisma, type PrismaTransactionClient } from '../db/client.js';
import { logger } from '../logger/index.js';
import { systemClock } from '../time/index.js';
import { named } from './named.js';
import { countFinding, countOutcome, startShadowSummary } from './shadowTally.js';
import { getAuth } from './requireAuth.js';

/**
 * Cedar enforcement points (ADR-005, P11.5), in shadow: every guarded route asks the
 * policies as well as its old guard, and only the old guard and the use case decide.
 * When the request finishes, a decision that disagrees with what the app answered is
 * logged, tagged with the `CHANGES.md` rows that explain it on that route, or as
 * unexplained. Shadow never changes a response: an evaluation error is logged and the
 * request continues.
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
  /** The `CHANGES.md` rows under which this route's answer may differ from today's. */
  readonly changes?: readonly ChangeId[];
  /**
   * Allowed when any one question is (a collection read, asked of candidate resources)
   * rather than all of them. With no candidate there is nothing to ask, and nothing to show.
   */
  readonly any?: boolean;
}

export interface CheckResult {
  readonly action: Action;
  readonly allowed: boolean;
  readonly policies: readonly string[];
  readonly errors: readonly string[];
}

export type ShadowOutcome =
  | { readonly kind: 'decided'; readonly allowed: boolean; readonly checks: readonly CheckResult[] }
  | { readonly kind: 'unaskable' }
  | { readonly kind: 'failed'; readonly error: string };

let engine: Authorizer | null = null;

/** The local engine until P11.6 gives an environment its policy store. */
function authorizer(): Authorizer {
  engine ??= new LocalCedarAuthorizer();
  return engine;
}

type Sink = (detail: Record<string, unknown>, message: string) => void;

let sink: Sink = (detail, message) => logger.warn({ authorization: detail }, message);

/** For tests: where shadow findings go instead of the log. */
export function useShadowSink(next: Sink | null): void {
  sink = next ?? ((detail, message) => logger.warn({ authorization: detail }, message));
}

/** For tests: the engine the enforcement points ask. */
export function useAuthorizer(next: Authorizer | null): void {
  engine = next;
}

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

/** Several questions, all of which must be allowed: a request that touches several resources. */
export function authorizeAll(
  name: string,
  checks: ChecksOf,
  options: AuthorizeOptions = {},
): RequestHandler {
  const point: EnforcementPoint = { checks, options };
  return named(`authorize(${name})`, (req: Request, res: Response, next: NextFunction): void => {
    void shadow(req, res, point).then(() => next());
  });
}

interface EnforcementPoint {
  readonly checks: ChecksOf;
  readonly options: AuthorizeOptions;
}

async function shadow(req: Request, res: Response, point: EnforcementPoint): Promise<void> {
  const outcome = await decide(req, point.checks, point.options.any ?? false).catch(
    (error: unknown): ShadowOutcome => ({
      kind: 'failed',
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }),
  );
  res.locals.authorization = outcome;
  tallyOutcome(outcome);
  res.once('finish', () => {
    const finding = compare(outcome, answerOf(res), point.options);
    if (!finding) return;
    countFinding();
    sink({ route: routeOf(req), role: req.auth?.role, ...finding.detail }, finding.message);
  });
}

function tallyOutcome(outcome: ShadowOutcome): void {
  startShadowSummary((tally) =>
    logger.info({ authorization: tally }, 'authorization shadow summary'),
  );
  if (outcome.kind === 'decided') countOutcome(outcome.allowed ? 'allowed' : 'denied');
  else countOutcome(outcome.kind);
}

/**
 * The policies' reads are plain queries, apart from the request's own, which shadow must
 * not change. Not an interactive transaction: under READ COMMITTED each statement has
 * its own snapshot anyway, so one bought no consistency, while it held a connection
 * through the Cedar evaluation and gave up after Prisma's 2 s wait for one. A cold pool
 * on staging took about 3 s to open connections, and the shadow check was the only
 * thing on those requests to fail (P11.5 release 2a, 9 October 2026).
 */
async function decide(req: Request, checks: ChecksOf, any: boolean): Promise<ShadowOutcome> {
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
    const decision = await authorizer().isAuthorized(request);
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
  const base = req.baseUrl.replace(/\/events\/[^/]+/, '/events/:eventId');
  return `${req.method} ${base}${(req.route as { path?: string } | undefined)?.path ?? ''}`;
}

interface Finding {
  readonly message: string;
  readonly detail: Record<string, unknown>;
}

/** What the app answered, and whether a legacy guard (which enforcement removes) refused. */
export interface Answer {
  readonly status: number;
  readonly legacyGuardRefused: boolean;
  /** The caller's own stored answer, decided when the original request was. */
  readonly replayed?: boolean;
}

function answerOf(res: Response): Answer {
  return {
    status: res.statusCode,
    legacyGuardRefused: res.locals.legacyGuardRefused === true,
    replayed: res.locals.idempotentReplay === true,
  };
}

/**
 * The app refused permission (403), or it served the request (below 400). Anything else
 * (not found, conflict, invalid) says nothing about permission, so it is not compared.
 * A refusal by the use case stays after enforcement; one by a legacy guard does not, so
 * the finding says which it was.
 */
export function compare(
  outcome: ShadowOutcome,
  answer: Answer,
  options: AuthorizeOptions,
): Finding | null {
  const { status } = answer;
  if (outcome.kind === 'unaskable' || answer.replayed) return null;
  if (outcome.kind === 'failed') {
    // The route's own validation, lookup or refusal answered the caller the same way.
    if ([400, 403, 404].includes(status)) return null;
    return {
      message: 'authorization shadow error',
      detail: { status, error: outcome.error },
    };
  }
  const disagrees = outcome.allowed ? status === 403 : status < 400;
  return disagrees ? mismatch(outcome, answer, options.changes ?? []) : null;
}

function mismatch(
  outcome: Extract<ShadowOutcome, { kind: 'decided' }>,
  answer: Answer,
  changes: readonly ChangeId[],
): Finding {
  const { status } = answer;
  return {
    message: 'authorization shadow mismatch',
    detail: {
      status,
      cedar: outcome.allowed ? 'allow' : 'deny',
      ...(outcome.allowed ? { refusedBy: answer.legacyGuardRefused ? 'guard' : 'use case' } : {}),
      checks: outcome.checks,
      explainedBy: changes.length > 0 ? changes : 'unexplained',
    },
  };
}
