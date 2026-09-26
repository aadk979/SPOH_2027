import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Id, IsoDateTime, PaginationQuery } from '@spoh/shared';
import { requireAuth } from '../../platform/identity/index.js';
import { defaultRateLimit } from '../../platform/http/rateLimit.js';
import { requireCapability } from '../../platform/access/index.js';
import { validate, validatedQuery } from '../../platform/http/validate.js';
import { prisma } from '../../platform/db/client.js';

/**
 * The audit log (BUILD_PLAN §7.2, §8.7).
 *
 * Read-only, Chief and Lead only. Every void, adjustment, reissue, status
 * change, roster edit, fallback declaration, import, station-scope bypass and
 * provisioning lands here — written inside the same transaction as the change
 * it describes, so the log is complete rather than merely usually complete.
 */
export const auditRouter: Router = Router();

const AuditQuery = PaginationQuery.extend({
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: Id.optional(),
  actorId: Id.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
}).strict();

auditRouter.use(requireAuth);

auditRouter.get(
  '/',
  defaultRateLimit,
  requireCapability('audit.read'),
  validate({ query: AuditQuery }),
  async (req: Request, res: Response) => {
    const query = validatedQuery<z.infer<typeof AuditQuery>>(req);

    const entries = await prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.from || query.to
          ? {
              createdAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lt: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    res.status(200).json({
      data: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        actorName: entry.actor?.displayName ?? 'System',
        before: entry.before,
        after: entry.after,
        requestId: entry.requestId,
        createdAt: entry.createdAt.toISOString(),
      })),
      meta: { count: entries.length, nextCursor: entries.at(-1)?.id ?? null },
    });
  },
);
