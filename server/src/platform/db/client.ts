import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { env, isTest } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { assertEventScoped, isScopeEnforced } from './eventScope.js';

/**
 * The single Prisma client for the process.
 *
 * Prisma 7 takes a driver adapter rather than a connection string, so the pool
 * is configured here. Pool sizing is deliberately modest: the event peaks at
 * roughly 80 concurrent volunteers making short capture writes, and a large
 * pool against an RDS t4g.micro buys nothing but connection-slot exhaustion.
 */
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  // A capture that waits five seconds for a connection has already failed the
  // volunteer; better to error and let the outbox retry than to hold the tap.
  connectionTimeoutMillis: 5_000,
});

const base = new PrismaClient({
  adapter,
  log: isTest
    ? []
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
});

if (!isTest) {
  base.$on('warn', (e) => logger.warn({ prisma: e }, 'prisma warning'));
  // Prisma error events carry query text. They go to the server log only and
  // are never surfaced to a client (BUILD_PLAN §7.1).
  base.$on('error', (e) => logger.error({ prisma: e }, 'prisma error'));
}

/**
 * The client every module uses: a query on an event-owned model must name its
 * event, in every environment (ADR-001 §2, `eventScope.ts`).
 */
export const prisma = base.$extends({
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (isScopeEnforced(model)) assertEventScoped(model, operation, args);
        return query(args);
      },
    },
  },
});

/** Readiness probe support: cheapest possible round trip to Postgres. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * The transaction client type, for services that must accept either the root
 * client or an open transaction. Audit writes ride in the same transaction as
 * the mutation they describe (BUILD_PLAN §8.7), which is what this enables.
 */
export type PrismaTransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/** A JSON value Prisma will store in a Json column, for callers outside data/. */
export type JsonValue = Prisma.InputJsonValue;
