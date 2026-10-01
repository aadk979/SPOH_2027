import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/** The visual clock never advances, so its in-process rate buckets never expire. */
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/spoh2027_visual_test') {
  throw new Error('This fixture script runs only against spoh2027_visual_test');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
try {
  const organisations = await prisma.organisation.findMany({ select: { id: true } });
  if (organisations.length !== 1) throw new Error('Expected one seeded visual organisation');
  const organisationId = organisations[0].id;
  const limits = {
    'rateLimit.max.default': 100_000,
    'rateLimit.max.capture': 100_000,
    'rateLimit.max.sensitive': 60,
    'rateLimit.max.admin': 100_000,
  };
  for (const [key, value] of Object.entries(limits)) {
    const where = { scope_scopeId_key: { scope: 'PLATFORM', scopeId: organisationId, key } };
    const current = await prisma.setting.findUnique({ where, select: { value: true } });
    if (current?.value === value) continue;
    await prisma.setting.upsert({
      where,
      create: { scope: 'PLATFORM', scopeId: organisationId, key, value, version: 1 },
      update: { value, version: { increment: 1 } },
    });
  }
  console.log('visual fixture rate limits ready');
} finally {
  await prisma.$disconnect();
}
