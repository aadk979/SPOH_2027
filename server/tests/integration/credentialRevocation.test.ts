import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it } from 'vitest';
import { revokeAllForVolunteer, revokeFamily } from '../../src/modules/auth/application/revokeSessions.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

beforeEach(resetDatabase);
const clock = fixedClock(FROZEN_NOW);
async function session(personId: string, familyId: string, revoked = false) {
  const row = await rawDb.refreshSession.create({ data: { volunteerId: personId, familyId, tokenHash: randomUUID(),
    issuedAt: FROZEN_NOW, expiresAt: new Date(FROZEN_NOW.getTime() + 60_000),
    providerTokenEncrypted: 'synthetic-private-envelope', providerTokenExpiresAt: FROZEN_NOW,
    ...(revoked ? { revokedAt: FROZEN_NOW, revokedReason: 'old-reason' } : {}) } });
  await rawDb.authHandoff.create({ data: { id: randomUUID(), sessionId: row.id, challenge: randomUUID(), expiresAt: row.expiresAt } });
  return row;
}
it('revokes exactly one family, clears terminal envelopes/handoffs and preserves other families', async () => {
  const person = await createVolunteer({ email: 'family-revoke@example.test', role: 'VOLUNTEER' });
  const familyId = randomUUID();
  const live = await session(person.id, familyId); const terminal = await session(person.id, familyId, true);
  const other = await session(person.id, randomUUID());
  expect(await revokeFamily(familyId, 'reviewed-family-revoke', clock)).toEqual({ count: 1 });
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: live.id } })).toMatchObject({
    revokedReason: 'reviewed-family-revoke', providerTokenEncrypted: null });
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: terminal.id } })).toMatchObject({
    revokedReason: 'old-reason', providerTokenEncrypted: null });
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
  expect(await rawDb.authHandoff.count()).toBe(1);
});
it('revokes all person families atomically and preserves another person, including on storage failure', async () => {
  const person = await createVolunteer({ email: 'person-revoke@example.test', role: 'VOLUNTEER' });
  const peer = await createVolunteer({ email: 'peer-revoke@example.test', role: 'VOLUNTEER' });
  const live = await session(person.id, randomUUID()); const second = await session(person.id, randomUUID());
  const terminal = await session(person.id, randomUUID(), true); const other = await session(peer.id, randomUUID());
  await rawDb.$executeRawUnsafe(`CREATE FUNCTION refuse_credential_revoke_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW."revokedReason" = 'synthetic-refusal' THEN RAISE EXCEPTION 'synthetic storage refusal'; END IF; RETURN NEW; END $$`);
  await rawDb.$executeRawUnsafe('CREATE TRIGGER refuse_credential_revoke_test BEFORE UPDATE ON "RefreshSession" FOR EACH ROW EXECUTE FUNCTION refuse_credential_revoke_test()');
  try {
    await expect(revokeAllForVolunteer(person.id, 'synthetic-refusal', clock)).rejects.toThrow();
    expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: live.id } })).toEqual(live);
    expect(await rawDb.authHandoff.count()).toBe(4);
  } finally {
    await rawDb.$executeRawUnsafe('DROP TRIGGER refuse_credential_revoke_test ON "RefreshSession"');
    await rawDb.$executeRawUnsafe('DROP FUNCTION refuse_credential_revoke_test()');
  }
  expect(await revokeAllForVolunteer(person.id, 'reviewed-person-revoke', clock)).toBe(2);
  for (const row of [live, second, terminal]) expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: row.id } }))
    .toMatchObject({ providerTokenEncrypted: null, revokedAt: FROZEN_NOW,
      revokedReason: row.id === terminal.id ? 'old-reason' : 'reviewed-person-revoke' });
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: other.id } })).toEqual(other);
  expect(await rawDb.authHandoff.count()).toBe(1);
});
