import { rawDb } from './db.js';

/**
 * The legacy settings table as it stood before migration
 * 20261007170000_drop_app_setting. The copy migrations still run on every new
 * database before that drop, so their harnesses recreate the table for each
 * test and drop it afterwards; nothing else may see it.
 */
export async function createLegacySettingsTable(): Promise<void> {
  await dropLegacySettingsTable();
  await rawDb.$executeRawUnsafe(`CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById")
      REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE
  )`);
}

export async function dropLegacySettingsTable(): Promise<void> {
  await rawDb.$executeRawUnsafe('DROP TABLE IF EXISTS "AppSetting"');
}

export interface LegacySetting {
  key: string;
  value: unknown;
  updatedById: string | null;
  updatedAt: Date;
}

/** One legacy row, as the legacy writer stored it. */
export async function insertLegacySetting(
  key: string,
  value: unknown,
  updatedById: string | null = null,
): Promise<void> {
  await rawDb.$executeRaw`INSERT INTO "AppSetting" ("key", "value", "updatedById", "updatedAt")
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${updatedById},
      ${new Date('2026-09-01T01:02:03.000Z')})`;
}

export function legacySettings(): Promise<LegacySetting[]> {
  return rawDb.$queryRaw<LegacySetting[]>`
    SELECT "key", "value", "updatedById", "updatedAt" FROM "AppSetting" ORDER BY "key"`;
}
