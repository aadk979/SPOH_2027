import { z } from 'zod';
import { Id, IsoDateTime, PaginationQuery } from './common.js';

/**
 * The audit trail (BUILD_PLAN §7.2, §8.7).
 *
 * Two kinds of row live in the same table on purpose.
 *
 *  - **Change events** are written inside the transaction that made the change,
 *    so the log is complete rather than merely usually complete. Every one of
 *    them carries `before`/`after`.
 *  - **Security events** have no mutation to ride along with — a refused sign-in
 *    or a denied capability changed nothing — so they are written on their own.
 *    They carry the transport detail (`method`, `path`, `statusCode`) instead.
 *
 * Keeping them in one table is what makes "what happened around 09:42" a single
 * query. `severity` and `outcome` are what let a reader tell them apart.
 */

/**
 * How much a row should raise an eyebrow.
 *
 * Not a log level — an ordinary `registration.void` is `NOTICE` because it is a
 * corrective action someone may have to explain later, while a `DEBUG`-ish
 * capture never reaches this table at all.
 */
export const AuditSeverity = z.enum(['INFO', 'NOTICE', 'WARNING', 'CRITICAL']);
export type AuditSeverity = z.infer<typeof AuditSeverity>;

/** Whether the actor got what they asked for. */
export const AuditOutcome = z.enum(['SUCCESS', 'DENIED', 'FAILURE']);
export type AuditOutcome = z.infer<typeof AuditOutcome>;

/** One row as the admin screen receives it. */
export const AuditLogRecord = z
  .object({
    id: Id,
    action: z.string(),
    severity: AuditSeverity,
    outcome: AuditOutcome,
    entityType: z.string(),
    entityId: Id.nullable(),
    actorId: Id.nullable(),
    /** Resolved display name, or `System` for an actorless row. */
    actorName: z.string(),
    actorSub: z.string().nullable(),
    /** Present on security events, null on change events. */
    method: z.string().nullable(),
    path: z.string().nullable(),
    statusCode: z.number().int().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    requestId: z.string().nullable(),
    before: z.unknown().nullable(),
    after: z.unknown().nullable(),
    createdAt: IsoDateTime,
  })
  .strict();
export type AuditLogRecord = z.infer<typeof AuditLogRecord>;

/**
 * Query parameters for the log screen.
 *
 * `cursor` and `sinceId` are the two directions of travel and are mutually
 * exclusive: `cursor` pages backwards through history (newest first), `sinceId`
 * tails forwards from a row the client already holds (oldest first, so the
 * caller can append). Both are bounded by `limit`, so neither can ever return
 * the whole table.
 */
export const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(64).optional(),
  /** Comma-separated prefix match, e.g. `auth.,session.` for everything auth-ish. */
  actionPrefix: z.string().trim().max(128).optional(),
  severity: AuditSeverity.optional(),
  outcome: AuditOutcome.optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: Id.optional(),
  actorId: Id.optional(),
  /** Free text over action, entity type, actor name and request id. */
  q: z.string().trim().max(120).optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  sinceId: Id.optional(),
})
  .strict()
  .refine((query) => !(query.cursor && query.sinceId), {
    message: 'send either cursor or sinceId, not both',
    path: ['sinceId'],
  });
export type AuditQuery = z.infer<typeof AuditQuery>;

/**
 * The list envelope.
 *
 * `hasMore` rather than a total: counting a table this size on every keystroke
 * is the query that takes the database down at 10am, and the screen only ever
 * needs to know whether to show the button.
 */
export const AuditLogPage = z
  .object({
    data: z.array(AuditLogRecord),
    meta: z
      .object({
        count: z.number().int().nonnegative(),
        nextCursor: Id.nullable(),
        hasMore: z.boolean(),
        /** Newest id in this page — what a tailing client sends back as `sinceId`. */
        latestId: Id.nullable(),
      })
      .strict(),
  })
  .strict();
export type AuditLogPage = z.infer<typeof AuditLogPage>;

/** Filter options, so the screen never hard-codes a list the server may extend. */
export const AuditFacets = z
  .object({
    actions: z.array(z.string()),
    entityTypes: z.array(z.string()),
    severities: z.array(AuditSeverity),
    outcomes: z.array(AuditOutcome),
  })
  .strict();
export type AuditFacets = z.infer<typeof AuditFacets>;

/** Where the log is being shipped, for the banner on the admin screen. */
export const AuditSinkStatus = z
  .object({
    cloudWatch: z
      .object({
        enabled: z.boolean(),
        logGroup: z.string().nullable(),
        auditLogGroup: z.string().nullable(),
        region: z.string().nullable(),
        /** Events accepted by CloudWatch since boot. */
        delivered: z.number().int().nonnegative(),
        /** Events dropped because the buffer filled while delivery was failing. */
        dropped: z.number().int().nonnegative(),
        lastError: z.string().nullable(),
        lastDeliveryAt: IsoDateTime.nullable(),
      })
      .strict(),
    retentionDays: z.number().int().positive().nullable(),
  })
  .strict();
export type AuditSinkStatus = z.infer<typeof AuditSinkStatus>;
