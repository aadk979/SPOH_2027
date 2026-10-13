import type { PrismaTransactionClient } from '../db/client.js';
import { ForbiddenError, NotFoundError, ServiceUnavailableError } from '../errors/index.js';
import { currentAuthorizer } from './engine.js';
import { uid } from './authorizer/types.js';
import type { AuthorizationRequest } from './authorizer/types.js';
import type { Action } from '@spoh/access-policies';

interface OrganisationPermission {
  organisationId: string;
  personId: string;
  subject?: string;
  action: Action;
}

/** A real organisation question also works when it has no events. */
export async function requireCurrentOrganisationPermission(tx: PrismaTransactionClient,
  input: OrganisationPermission): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.personId} FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "organisationId" = ${input.organisationId}
    AND "personId" = ${input.personId} FOR SHARE`;
  const person = await tx.person.findUnique({ where: { id: input.personId },
    select: { deactivatedAt: true, piiErasedAt: true, cognitoSub: true } });
  const organisation = await tx.organisation.findUnique({ where: { id: input.organisationId }, select: { id: true } });
  if (!organisation) throw new NotFoundError('Organisation');
  if (!person || (input.subject && person.cognitoSub !== input.subject)) throw refused();
  const membership = await tx.organisationMembership.findUnique({ where: {
    organisationId_personId: { organisationId: input.organisationId, personId: input.personId },
  }, select: { role: true } });
  if (!membership) throw new NotFoundError('Organisation');
  const principal = uid('Person', input.personId);
  const resource = uid('Organisation', organisation.id);
  const decision = await evaluateOrganisation({ principal, resource, action: input.action,
    eventId: null, context: { eventPhase: 'ORGANISATION', lateSyncAllowed: false, onTrustedNetwork: false },
    entities: [{ uid: principal, attrs: { active: person.deactivatedAt === null && person.piiErasedAt === null,
      platformAdmin: membership?.role === 'PLATFORM_ADMIN' }, parents: [] },
    { uid: resource, attrs: {}, parents: [] }] });
  if (decision.errors.length) throw new ServiceUnavailableError('Permissions could not be checked.');
  if (!decision.allowed) throw refused();
}

const refused = () => new ForbiddenError('Current platform administrator access is required for this organisation.');

async function evaluateOrganisation(request: AuthorizationRequest) {
  try { return await currentAuthorizer().isAuthorized(request); }
  catch (cause) { throw new ServiceUnavailableError('Permissions could not be checked.', cause); }
}
