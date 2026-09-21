import { createHmac, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { ForbiddenError } from '../../lib/errors.js';

export const ATTENDANCE_TTL_MS = 5 * 60_000;
// Domain-separated key: an attendance QR can never authenticate an API session.
const key = createHmac(
  'sha256',
  env.ATTENDANCE_SIGNING_SECRET ?? env.SESSION_SIGNING_SECRET ?? randomBytes(32),
)
  .update('spoh-attendance-v1')
  .digest();

export function hashPin(pin: string): string {
  return createHmac('sha256', key).update(`pin:${pin}`).digest('hex');
}

export async function signAttendanceToken(
  id: string,
  issuerId: string,
  eventDayId: string,
  now: Date,
): Promise<string> {
  return new SignJWT({ eventDayId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('spoh-attendance')
    .setAudience('spoh-attendance')
    .setSubject(issuerId)
    .setJti(id)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor((now.getTime() + ATTENDANCE_TTL_MS) / 1000))
    .sign(key);
}

export async function verifyAttendanceToken(
  token: string,
  now = new Date(),
): Promise<{ id: string; issuerId: string; eventDayId: string }> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: 'spoh-attendance',
      audience: 'spoh-attendance',
      requiredClaims: ['exp', 'iat', 'sub', 'jti'],
      currentDate: now,
      maxTokenAge: '5m',
    });
    if (
      !payload.jti ||
      !payload.sub ||
      typeof payload.eventDayId !== 'string' ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' ||
      payload.exp - payload.iat > 300 ||
      payload.iat > now.getTime() / 1000
    )
      throw new Error();
    return { id: payload.jti, issuerId: payload.sub, eventDayId: payload.eventDayId };
  } catch {
    throw new ForbiddenError('This attendance QR is invalid or expired. Scan a fresh code.');
  }
}
