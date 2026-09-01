import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env, isProduction, isTest } from '../config/env.js';
import { logger } from './logger.js';

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
  max: isProduction ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({
  adapter,
  log: isTest
    ? []
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
});

if (!isTest) {
  prisma.$on('warn', (e) => logger.warn({ prisma: e }, 'prisma warning'));
  // Prisma error events carry query text. They go to the server log only and
  // are never surfaced to a client (BUILD_PLAN §7.1).
  prisma.$on('error', (e) => logger.error({ prisma: e }, 'prisma error'));
}

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
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
