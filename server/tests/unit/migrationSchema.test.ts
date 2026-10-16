import { expect, it } from 'vitest';
import { namespaceMigrationSql } from '../helpers/migrationSchema.js';

const schema = `migration_test_${'a'.repeat(32)}`;
it('relocates qualified migration functions and tables while preserving their SQL behavior', () => {
  const sql =
    'CREATE TABLE "Owned" (id TEXT); CREATE FUNCTION public.fn() RETURNS trigger AS $$ SELECT * FROM "public"."Owned"; $$ LANGUAGE sql;';
  expect(namespaceMigrationSql(sql, schema)).toBe(
    `CREATE TABLE "Owned" (id TEXT); CREATE FUNCTION "${schema}".fn() RETURNS trigger AS $$ SELECT * FROM "${schema}"."Owned"; $$ LANGUAGE sql;`,
  );
});
it.each([
  'public',
  'migration_test_',
  `migration_test_${'A'.repeat(32)}`,
  `migration_test_${'a'.repeat(31)}`,
  `other_${'a'.repeat(32)}`,
  `${schema}"; DROP SCHEMA public; --`,
])('refuses an unowned or unsafe schema identifier %s', (name) => {
  expect(() => namespaceMigrationSql('SELECT 1', name)).toThrow('owned migration test schema');
});
it.each(['CREATE DATABASE another_test', 'DROP DATABASE spoh2027_test', 'CREATE SCHEMA public'])(
  'refuses migration text that escapes schema isolation: %s',
  (sql) => {
    expect(() => namespaceMigrationSql(sql, schema)).toThrow('cannot change databases');
  },
);
