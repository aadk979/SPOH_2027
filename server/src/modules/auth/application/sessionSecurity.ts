import { identityProvider } from '../../../platform/identity/index.js';
import { encryptProviderToken } from '../../../platform/identity/protectedTokens.js';
import { loadResolvedSetting } from '../../../platform/settings/scopedStore.js';
import { systemClock } from '../../../platform/time/index.js';
import { personNeedsMfa } from '../data/securityRepo.js';
import { sessionEnded } from '../domain/sessionRules.js';
import type { SessionContext } from './issueSession.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { prisma } from '../../../platform/db/client.js';

export async function adminSetting(
  scope: EventScope,
  key: 'security.adminIdleMinutes' | 'security.adminSessionHours',
) {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: scope.eventId },
    select: { organisationId: true },
  });
  return Number((await loadResolvedSetting(key, { organisationId: event.organisationId })).value);
}

export async function sessionSecurity(
  person: { id: string; email: string; scope: EventScope },
  context: SessionContext,
) {
  const admin = await personNeedsMfa(person.id);
  const now = systemClock.now();
  const mfaPending = admin && !(await identityProvider.hasMfa(person.email));
  if (mfaPending && !context.providerAccessToken) throw sessionEnded();
  return {
    mfaPending,
    absoluteExpiresAt: admin
      ? new Date(
          now.getTime() +
            (await adminSetting(person.scope, 'security.adminSessionHours')) * 3_600_000,
        )
      : null,
    providerTokenEncrypted: mfaPending
      ? encryptProviderToken(context.providerAccessToken as string)
      : null,
    providerTokenExpiresAt: mfaPending ? new Date(now.getTime() + 300_000) : null,
  };
}
