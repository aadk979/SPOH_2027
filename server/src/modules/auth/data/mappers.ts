import { type CommitteeRole, type SessionResponse, type SessionSummary } from '@spoh/shared';

export function toSessionResponse(
  volunteer: { id: string; displayName: string; role: CommitteeRole },
  access: { token: string; expiresIn: number },
): SessionResponse {
  return {
    accessToken: access.token,
    tokenType: 'Bearer',
    expiresIn: access.expiresIn,
    volunteer: {
      id: volunteer.id,
      displayName: volunteer.displayName,
      role: volunteer.role,
    },
    // Overwritten by the router if the cookie could not actually be set.
    refreshAvailable: true,
  };
}

export function toSessionSummary(
  row: {
    id: string;
    userAgent: string | null;
    issuedAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
  },
  currentSessionId: string | null,
): SessionSummary {
  return {
    id: row.id,
    userAgent: row.userAgent,
    issuedAt: row.issuedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    current: row.id === currentSessionId,
  };
}
