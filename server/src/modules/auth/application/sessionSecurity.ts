import { identityProvider } from '../../../platform/identity/index.js';
import { encryptProviderToken } from '../../../platform/identity/protectedTokens.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { personNeedsMfa } from '../data/securityRepo.js';
import { sessionEnded } from '../domain/sessionRules.js';
import type { SessionContext } from './issueSession.js';
import type { SessionScope } from '../domain/sessionScope.js';
import { sessionOrganisation } from './sessionOrganisation.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { refreshExpiry } from '../domain/sessionRules.js';
import { refreshSessionDays } from './sessionLifetime.js';

export async function adminSetting(
  scope: SessionScope,
  key: 'security.adminIdleMinutes' | 'security.adminSessionHours',
  tx: PrismaTransactionClient = prisma,
) {
  const organisationId = await sessionOrganisation(scope, tx);
  return Number((await loadResolvedSetting(key, { organisationId }, tx)).value);
}

export async function sessionSecurity(
  tx: PrismaTransactionClient,
  input: { person: { id: string; email: string; cognitoSub: string; scope: SessionScope }; context: SessionContext; now: Date },
) {
  const { person, context, now } = input;
  const admin = await personNeedsMfa(person.id, tx);
  const mfaPending = admin && !(await identityProvider.hasMfa(person.email, person.cognitoSub));
  if (mfaPending && !context.providerAccessToken) throw sessionEnded();
  return {
    mfaPending,
    absoluteExpiresAt: admin
      ? new Date(
          now.getTime() +
            (await adminSetting(person.scope, 'security.adminSessionHours', tx)) * 3_600_000,
        )
      : refreshExpiry(now, Math.min(await refreshSessionDays(person.scope, tx), 30)),
    providerTokenEncrypted: mfaPending
      ? encryptProviderToken(context.providerAccessToken as string)
      : null,
    providerTokenExpiresAt: mfaPending ? new Date(now.getTime() + 300_000) : null,
  };
}
