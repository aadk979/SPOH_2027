import { InternalError } from '../errors/index.js';
import { EVENT_OWNED_MODELS } from './eventOwned.generated.js';

/**
 * The event a repository call works in (ADR-001 §2). Every repository
 * function for an event-owned model takes one as its first parameter.
 */
export interface EventScope {
  eventId: string;
}

/**
 * A query on an event-owned model without its event. Always a bug, never a user
 * error: it fails the request with a 500 and is logged as an error.
 */
export class MissingEventScopeError extends InternalError {
  readonly model: string;
  readonly operation: string;

  constructor(model: string, operation: string) {
    super(`${model}.${operation} ran without an eventId`);
    this.model = model;
    this.operation = operation;
  }
}

type Args = Record<string, unknown> | undefined;

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `eventId: 'x'` or `eventId: { equals: 'x' }` / `{ in: [...] }`. */
function namesEvent(eventId: unknown): boolean {
  if (typeof eventId === 'string') return true;
  return isRecord(eventId) && (typeof eventId.equals === 'string' || Array.isArray(eventId.in));
}

/** A compound unique key that starts with the event: `eventId_id: { eventId, id }`. */
function compoundNamesEvent(where: Record<string, unknown>): boolean {
  return Object.entries(where).some(
    ([key, value]) => key.startsWith('eventId_') && isRecord(value) && namesEvent(value.eventId),
  );
}

/** The event at the top of a where, in a compound key, or in one of its ANDs. */
function whereHasEvent(where: unknown): boolean {
  if (!isRecord(where)) return false;
  if (namesEvent(where.eventId) || compoundNamesEvent(where)) return true;
  return Array.isArray(where.AND) && where.AND.some(whereHasEvent);
}

function dataHasEvent(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (typeof data.eventId === 'string') return true;
  const event = data.event;
  return isRecord(event) && isRecord(event.connect) && typeof event.connect.id === 'string';
}

function rows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [data];
}

const WRITE_CHECKS: Record<string, (args: Args) => boolean> = {
  create: (args) => dataHasEvent(args?.data),
  createMany: (args) => rows(args?.data).every(dataHasEvent),
  createManyAndReturn: (args) => rows(args?.data).every(dataHasEvent),
  upsert: (args) => whereHasEvent(args?.where) && dataHasEvent(args?.create),
};

/** Throws unless an operation on `model` names its event. */
export function assertEventScoped(model: string, operation: string, args: Args): void {
  const scoped = WHERE_OPERATIONS.has(operation)
    ? whereHasEvent(args?.where)
    : (WRITE_CHECKS[operation]?.(args) ?? false);
  if (!scoped) throw new MissingEventScopeError(model, operation);
}

/**
 * Models whose repositories take an `EventScope` so far. P09.5 moves the
 * modules over one slice at a time; when it ends this is every event-owned
 * model and the list goes away.
 */
const ENFORCED: ReadonlySet<string> = new Set<string>([]);

export function isScopeEnforced(model: string): boolean {
  return ENFORCED.has(model) && (EVENT_OWNED_MODELS as readonly string[]).includes(model);
}
