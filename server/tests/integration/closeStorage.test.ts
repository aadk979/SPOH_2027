import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

const target = '20261002030000_lifecycle_close_storage';
const migrations = new URL('../../prisma/migrations/', import.meta.url);
const databaseName = 'spoh2027_close_storage_migration_test';
const url = new URL(process.env.DATABASE_URL!);
url.pathname = `/${databaseName}`;
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
let db: pg.Client;
let sequence = 0;

async function manageDatabase(sql: string) {
  if (!databaseName.endsWith('_test')) throw new Error('Dedicated _test database required');
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(sql);
  } finally {
    await admin.end();
  }
}

beforeAll(async () => {
  await manageDatabase(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await manageDatabase(`CREATE DATABASE "${databaseName}"`);
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  for (const name of readdirSync(migrations)
    .filter((name) => name < target)
    .sort()) {
    await db.query(readFileSync(new URL(`${name}/migration.sql`, migrations), 'utf8'));
  }
  await db.query(
    'INSERT INTO "Organisation" (id,slug,name,"appName","defaultTimezone","updatedAt") VALUES ($1,$1,$1,$1,$2,now())',
    ['close-org', 'Asia/Singapore'],
  );
  await db.query(
    'INSERT INTO "Person" (id,"cognitoSub","displayName",email,"updatedAt") VALUES ($1,$1,$1,$2,now())',
    ['close-actor', 'close-actor@test.invalid'],
  );
  for (const id of ['close-a', 'close-b']) {
    await db.query(
      'INSERT INTO "Event" (id,"organisationId",slug,name,timezone,status,"updatedAt") VALUES ($1,$2,$1,$1,$3,$4,now())',
      [id, 'close-org', 'Asia/Singapore', 'CLOSED'],
    );
  }
  for (const [id, sub] of [
    ['legacy-human', 'user-sub'],
    ['legacy-system', 'system'],
  ]) {
    await db.query(
      'INSERT INTO "AuditLog" (id,"eventId","actorSub",action,"entityType",after) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, 'close-a', sub, 'event.transition', 'Event', { status: 'CLOSED', version: 3 }],
    );
  }
  await db.query(
    'INSERT INTO "SettingChange" (id,scope,"scopeId","eventId",key,version,source,after) VALUES ($1,$2,$3,$3,$4,1,$5,$6)',
    ['legacy-setting', 'EVENT', 'close-a', 'capture.lateSyncHours', 'USER', 24],
  );
  await db.query(readFileSync(new URL(`${target}/migration.sql`, migrations), 'utf8'));
});

afterAll(async () => {
  await db?.end();
  await manageDatabase(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
});

async function action(eventId: string | null = 'close-a') {
  const id = `action-${++sequence}`;
  await db.query(
    'INSERT INTO "ScheduledAction" (id,"eventId",type,payload,"runAt","createdByPersonId") VALUES ($1,$2,$3,$4,now(),$5)',
    [id, eventId, 'event.archiveReminder', {}, 'close-actor'],
  );
  return id;
}

async function snapshot(
  input: {
    eventId?: string;
    kind?: string;
    version?: number;
    key?: string;
    rehearsal?: boolean;
  } = {},
) {
  const id = `snapshot-${++sequence}`;
  const version = input.version ?? 3;
  await db.query(
    'INSERT INTO "ReportSnapshot" (id,"eventId",kind,"lifecycleVersion","dedupeKey",report,"rehearsalIncluded","createdByPersonId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      id,
      input.eventId ?? 'close-a',
      input.kind ?? 'FINAL',
      version,
      input.key ?? `final:${version}`,
      { registrations: { total: 7 }, footfall: { total: 11 }, cards: { issued: 4 } },
      input.rehearsal ?? false,
      'close-actor',
    ],
  );
  return id;
}

it('preserves existing audit payloads, phase history and setting history, creating no synthetic jobs or reports', async () => {
  expect(
    (await db.query('SELECT id,source,"scheduledActionId",after FROM "AuditLog" ORDER BY id')).rows,
  ).toEqual([
    {
      id: 'legacy-human',
      source: 'USER',
      scheduledActionId: null,
      after: { status: 'CLOSED', version: 3 },
    },
    {
      id: 'legacy-system',
      source: 'SYSTEM',
      scheduledActionId: null,
      after: { status: 'CLOSED', version: 3 },
    },
  ]);
  expect(
    (
      await db.query('SELECT status,"hasBeenLive","lifecycleVersion" FROM "Event" WHERE id=$1', [
        'close-a',
      ])
    ).rows[0],
  ).toEqual({ status: 'CLOSED', hasBeenLive: true, lifecycleVersion: 0 });
  expect(
    (
      await db.query('SELECT source,after,"scheduledActionId" FROM "SettingChange" WHERE id=$1', [
        'legacy-setting',
      ])
    ).rows[0],
  ).toEqual({ source: 'USER', after: 24, scheduledActionId: null });
  expect(
    (await db.query('SELECT count(*)::int AS count FROM "ScheduledAction"')).rows[0]?.count,
  ).toBe(0);
  expect(
    (await db.query('SELECT count(*)::int AS count FROM "ReportSnapshot"')).rows[0]?.count,
  ).toBe(0);
});

it.each(['user-sub', 'system'])(
  'supports an older audit writer without source metadata (%s)',
  async (sub) => {
    const id = `old-writer-${++sequence}`;
    await db.query(
      'INSERT INTO "AuditLog" (id,"actorSub",action,"entityType") VALUES ($1,$2,$3,$4)',
      [id, sub, 'setting.change', 'Setting'],
    );
    expect(
      (await db.query('SELECT source FROM "AuditLog" WHERE id=$1', [id])).rows[0]?.source,
    ).toBe(sub === 'system' ? 'SYSTEM' : 'USER');
  },
);

it('stores an unleased pending action with bounded retry and version defaults', async () => {
  const id = await action();
  expect(
    (
      await db.query(
        'SELECT status,attempts,"maxAttempts",version,"lockedBy","lockedUntil","completedAt",recurrence FROM "ScheduledAction" WHERE id=$1',
        [id],
      )
    ).rows[0],
  ).toEqual({
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    version: 1,
    lockedBy: null,
    lockedUntil: null,
    completedAt: null,
    recurrence: null,
  });
});

it.each([
  ['negative attempts', 'attempts = -1'],
  ['excess attempts', 'attempts = 6'],
  ['no attempts allowed', '"maxAttempts" = 0'],
  ['unbounded attempts', '"maxAttempts" = 11'],
  ['zero version', 'version = 0'],
  ['nonpositive recurrence', 'recurrence = 0'],
  ['unbounded error', '"lastError" = repeat(\'x\',501)'],
  ['running without lease', "status = 'RUNNING'"],
  ['partial lease', '"lockedBy" = \'worker\''],
  ['pending with lease', '"lockedBy" = \'worker\', "lockedUntil" = now()'],
  ['success without completion', "status = 'SUCCEEDED'"],
  ['pending with completion', '"completedAt" = now()'],
])('rejects invalid persisted action state: %s', async (_name, assignment) => {
  const id = await action();
  await expect(
    db.query(`UPDATE "ScheduledAction" SET ${assignment} WHERE id=$1`, [id]),
  ).rejects.toMatchObject({ code: '23514' });
});

it('permits leased execution and completed terminal outcomes while enforcing occurrence deduplication', async () => {
  const id = await action();
  await db.query(
    'UPDATE "ScheduledAction" SET status=\'RUNNING\', "lockedBy"=$1, "lockedUntil"=now(),attempts=1,"dedupeKey"=$2 WHERE id=$3',
    ['worker', 'close-a:reminder:3', id],
  );
  await db.query(
    'UPDATE "ScheduledAction" SET status=\'SUCCEEDED\', "lockedBy"=NULL,"lockedUntil"=NULL,"completedAt"=now() WHERE id=$1',
    [id],
  );
  const duplicate = await action();
  await expect(
    db.query('UPDATE "ScheduledAction" SET "dedupeKey"=$1 WHERE id=$2', [
      'close-a:reminder:3',
      duplicate,
    ]),
  ).rejects.toMatchObject({ code: '23505' });
});

it('deduplicates final reports by phase version within each event, allowing recurring daily snapshots', async () => {
  await snapshot();
  await expect(snapshot()).rejects.toMatchObject({ code: '23505' });
  await snapshot({ eventId: 'close-b' });
  await snapshot({ kind: 'DAILY', key: 'daily:1' });
  await snapshot({ kind: 'DAILY', key: 'daily:2' });
  await expect(snapshot({ version: 4, key: 'wrong-final-key' })).rejects.toMatchObject({
    code: '23514',
  });
  await expect(snapshot({ version: 4, rehearsal: true })).rejects.toMatchObject({ code: '23514' });
});

it('keeps a frozen document immutable and permits superseding it only once', async () => {
  const id = await snapshot({ version: 5 });
  await expect(
    db.query('UPDATE "ReportSnapshot" SET report=$1 WHERE id=$2', [{ changed: true }, id]),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    db.query('UPDATE "ReportSnapshot" SET "eventId"=$1 WHERE id=$2', ['close-b', id]),
  ).rejects.toMatchObject({ code: '23514' });
  await db.query('UPDATE "ReportSnapshot" SET "supersededAt"=now() WHERE id=$1', [id]);
  await expect(
    db.query('UPDATE "ReportSnapshot" SET "supersededAt"=NULL WHERE id=$1', [id]),
  ).rejects.toMatchObject({ code: '23514' });
  expect(
    (await db.query('SELECT report FROM "ReportSnapshot" WHERE id=$1', [id])).rows[0]?.report,
  ).toEqual({ registrations: { total: 7 }, footfall: { total: 11 }, cards: { issued: 4 } });
});

it.each(['close-b', null])(
  'refuses a scheduled audit in a different scope (%s)',
  async (eventId) => {
    const id = await action();
    await expect(
      db.query(
        'INSERT INTO "AuditLog" (id,"eventId",action,"entityType",source,"scheduledActionId") VALUES ($1,$2,$3,$4,$5,$6)',
        [`scope-audit-${++sequence}`, eventId, 'event.transition', 'Event', 'SCHEDULE', id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  },
);

it('accepts scheduled audits only with linked same-event or same-platform scope and prevents action scope drift', async () => {
  for (const eventId of ['close-a', null]) {
    const id = await action(eventId);
    await db.query(
      'INSERT INTO "AuditLog" (id,"eventId",action,"entityType",source,"scheduledActionId") VALUES ($1,$2,$3,$4,$5,$6)',
      [`same-audit-${++sequence}`, eventId, 'event.transition', 'Event', 'SCHEDULE', id],
    );
    await expect(
      db.query('UPDATE "ScheduledAction" SET "eventId"=$1 WHERE id=$2', ['close-b', id]),
    ).rejects.toMatchObject({ code: '23514' });
  }
  await expect(
    db.query('INSERT INTO "AuditLog" (id,action,"entityType",source) VALUES ($1,$2,$3,$4)', [
      'missing-action',
      'event.transition',
      'Event',
      'SCHEDULE',
    ]),
  ).rejects.toMatchObject({ code: '23514' });
});

it('enforces schedule references and same-event scope on setting history', async () => {
  const id = await action();
  const sql =
    'INSERT INTO "SettingChange" (id,scope,"scopeId","eventId",key,version,source,"scheduledActionId") VALUES ($1,$2,$3,$3,$4,1,$5,$6)';
  await db.query(sql, [
    'scheduled-setting',
    'EVENT',
    'close-a',
    'capture.lateSyncHours',
    'SCHEDULE',
    id,
  ]);
  await expect(
    db.query(sql, ['foreign-setting', 'EVENT', 'close-b', 'capture.lateSyncHours', 'SCHEDULE', id]),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(
    db.query(sql, [
      'missing-setting',
      'EVENT',
      'close-a',
      'capture.lateSyncHours',
      'SCHEDULE',
      'missing',
    ]),
  ).rejects.toMatchObject({ code: '23503' });
  await expect(db.query('DELETE FROM "ScheduledAction" WHERE id=$1', [id])).rejects.toMatchObject({
    code: '23503',
  });
});

it('retains event and creator references rather than converting a removed author into a system action', async () => {
  await expect(db.query('DELETE FROM "Person" WHERE id=$1', ['close-actor'])).rejects.toMatchObject(
    { code: '23503' },
  );
  await expect(db.query('DELETE FROM "Event" WHERE id=$1', ['close-a'])).rejects.toMatchObject({
    code: '23503',
  });
});
