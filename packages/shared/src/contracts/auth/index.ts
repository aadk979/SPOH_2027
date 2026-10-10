import { z } from 'zod';
import { CommitteeRole } from '../../invariants/enums.js';
import { Id, IsoDateTime } from '../common/index.js';

/**
 * Session lifecycle.
 *
 * The API issues its own short-lived access token rather than passing the
 * identity provider's straight through. Two reasons, and the second is the one
 * that matters operationally:
 *
 *  1. It decouples session length from the provider. A Cognito access token
 *     lives an hour; a volunteer's shift lives five.
 *
 *  2. It makes a refresh path possible. The access token stays in memory —
 *     never localStorage, on a phone that gets shared, borrowed and lost — and
 *     the refresh token is an httpOnly cookie the page cannot read. A hard
 *     refresh recovers the session without ever exposing a long-lived
 *     credential to script.
 *
 * The refresh token is opaque, rotated on every use, and stored server-side
 * only as a SHA-256. Presenting one that was already rotated means the cookie
 * leaked, and revokes the whole family.
 */

/**
 * Exchange a provider credential for a session.
 *
 * Against Cognito the client sends the access token it just obtained from the
 * hosted sign-in. Against the development provider it sends an email; the
 * server mints the provider token itself. Exactly one of the two is required.
 */
export const CreateSessionRequest = z
  .object({
    /** Cognito access token. Verified against the pool before a session opens. */
    providerAccessToken: z.string().min(1).max(8192).optional(),
    /** Development sign-in only; ignored when the server runs against Cognito. */
    email: z.email().max(254).toLowerCase().optional(),
    /** Development sign-in only: assume this role, to exercise the matrix. */
    role: CommitteeRole.optional(),
  })
  .strict()
  .refine((body) => Boolean(body.providerAccessToken) !== Boolean(body.email), {
    message: 'send either providerAccessToken or email, not both',
  });
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const SessionResponse = z
  .object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    /** Seconds until the access token expires. The client refreshes before this. */
    expiresIn: z.number().int().positive(),
    volunteer: z
      .object({
        id: Id,
        displayName: z.string(),
        role: CommitteeRole,
      })
      .strict(),
    /**
     * False when the refresh cookie could not be set — a cross-site context
     * without secure transport, typically. The client then knows a hard refresh
     * will sign the volunteer out, and can say so rather than losing the
     * session silently.
     */
    refreshAvailable: z.boolean(),
    /** A restricted session that can only enrol TOTP before opening the app. */
    mfaRequired: z.boolean().optional(),
  })
  .strict();
export type SessionResponse = z.infer<typeof SessionResponse>;

/** One active session, for the "signed in on these devices" list. */
export const SessionSummary = z
  .object({
    id: Id,
    userAgent: z.string().nullable(),
    issuedAt: IsoDateTime,
    lastUsedAt: IsoDateTime.nullable(),
    expiresAt: IsoDateTime,
    /** True for the session making this request. */
    current: z.boolean(),
  })
  .strict();
export type SessionSummary = z.infer<typeof SessionSummary>;

export const RedeemHandoffRequest = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  })
  .strict();
export type RedeemHandoffRequest = z.infer<typeof RedeemHandoffRequest>;
export const VerifyMfaRequest = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export type VerifyMfaRequest = z.infer<typeof VerifyMfaRequest>;
export const MfaSetupResponse = z.object({ secretCode: z.string().min(1) }).strict();
export type MfaSetupResponse = z.infer<typeof MfaSetupResponse>;
