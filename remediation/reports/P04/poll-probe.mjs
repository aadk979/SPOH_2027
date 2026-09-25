/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * P04.8: times the two polls the event runs on, alone and in bursts, against a
 * local API on :4011 started with AUTH_PROVIDER=local (see README.md). Mints dev
 * tokens the way server/scripts/load-test.mjs does. Run from server/.
 */
import { createHash } from 'node:crypto';
import { SignJWT } from 'jose';
const key = new TextEncoder().encode('dev-only-secret-change-me-at-least-32-chars');
const sub = (e) => `local:${createHash('sha256').update(e).digest('hex').slice(0, 32)}`;
const token = (e, r) =>
  new SignJWT({ groups: [r] })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub(e))
    .setIssuer('spoh2027-local-dev')
    .setAudience('spoh2027-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
const pct = (xs, p) => xs.sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];
async function probe(path, who, role, concurrency, rounds) {
  const t = await token(who, role);
  const times = [];
  for (let r = 0; r < rounds; r += 1) {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const s = performance.now();
        const res = await fetch(`http://localhost:4011/api/v1${path}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        await res.arrayBuffer();
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        times.push(performance.now() - s);
      }),
    );
  }
  console.log(
    `${path.padEnd(22)} x${concurrency} concurrent, ${rounds} rounds: p50 ${pct(times, 0.5).toFixed(0)}ms p95 ${pct(times, 0.95).toFixed(0)}ms max ${Math.max(...times).toFixed(0)}ms`,
  );
}
await probe('/dashboard/live', 'chief@spoh2027.test', 'CHIEF_COORDINATOR', 1, 10);
await probe('/dashboard/live', 'chief@spoh2027.test', 'CHIEF_COORDINATOR', 30, 5);
await probe('/lost-person/active', 'booth@spoh2027.test', 'VOLUNTEER', 1, 10);
await probe('/lost-person/active', 'booth@spoh2027.test', 'VOLUNTEER', 100, 3);
