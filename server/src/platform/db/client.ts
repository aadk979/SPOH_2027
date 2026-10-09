import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { env, isTest } from '../../config/env.js';
import { logger } from '../logger/index.js';
import { assertEventScoped, isScopeEnforced } from './eventScope.js';

/**
 * A capture that waits five seconds for a connection has already failed the
 * volunteer; better to error and let the outbox retry than to hold the tap.
 * Queries and interactive transactions share this one wait: Prisma's own
 * default for a transaction is 2 s, which made a transaction the first thing
 * to fail while the pool was still opening connections.
 */
const CONNECTION_WAIT_MS = 5_000;

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
  // Connections opened beyond the floor close after 30 s idle; the floor stays
  // open, so the first burst after a quiet spell (a screen's first load, a
  // fresh task after a deploy) does not wait for TLS handshakes to RDS.
  min: env.DATABASE_POOL_MIN,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: CONNECTION_WAIT_MS,
  // The driver adapter writes and reads instants as UTC wall times, so a
  // session in any other zone would shift every timestamp it touches. Pinned
  // here rather than trusted to the server's default (F01 time audit, case 12);
  // wall-clock questions go through the event's zone explicitly (zonedSql.ts).
  options: '-c TimeZone=UTC',
});

const base = new PrismaClient({
  adapter,
  transactionOptions: { maxWait: CONNECTION_WAIT_MS },
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

/**
 * Opens the pool's floor at start-up: as many round trips at once as the floor
 * keeps, so each takes a connection of its own and the pool keeps them.
 */
export async function warmPool(): Promise<void> {
  await Promise.all(
    Array.from(
      { length: env.DATABASE_POOL_MIN },
      () => prisma.$queryRaw`SELECT 1 FROM pg_sleep(0.05)`,
    ),
  );
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
/** Explicit JSON null and SQL NULL for Prisma's distinct nullable JSON inputs. */
export const jsonNull = Prisma.JsonNull;
export const dbNull = Prisma.DbNull;
