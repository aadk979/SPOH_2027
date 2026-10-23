import { createHash, randomUUID } from 'node:crypto';
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';
import { cognitoSubject } from './cognitoSubject.js';
import type { Prisma, PrismaClient } from '../src/generated/prisma/client.js';

export interface BootstrapAdmin {
  organisationId: string;
  email: string;
  displayName: string;
  subject: string;
  userPoolId: string;
  region: string;
  approvalReference: string;
}

const bootstrapSchema = z
  .object({
    organisationId: z.string().trim().min(1).max(128),
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    displayName: z.string().trim().min(1).max(200),
    subject: cognitoSubject,
    userPoolId: z.string().regex(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/),
    region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
    approvalReference: z.string().trim().min(1).max(512),
  })
  .refine((input) => input.userPoolId.startsWith(`${input.region}_`));

/** Production bootstrap never derives a development identity or guesses an organisation. */
export function bootstrapAdminConfiguration(source: NodeJS.ProcessEnv): BootstrapAdmin {
  const required = [
    'SEED_ADMIN_ORGANISATION_ID',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_NAME',
    'SEED_ADMIN_SUB',
    'COGNITO_USER_POOL_ID',
    'COGNITO_REGION',
    'SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE',
  ] as const;
  if (
    source.SPOH_SKIP_DOTENV !== '1' ||
    !source.DATABASE_URL ||
    required.some((key) => !source[key]?.trim())
  )
    throw new Error(
      'Production bootstrap requires an explicit database, skip-dotenv, verified identity, organisation and owner reference.',
    );
  const parsed = bootstrapSchema.safeParse({
    organisationId: source.SEED_ADMIN_ORGANISATION_ID,
    email: source.SEED_ADMIN_EMAIL?.trim(),
    displayName: source.SEED_ADMIN_NAME,
    subject: source.SEED_ADMIN_SUB,
    userPoolId: source.COGNITO_USER_POOL_ID,
    region: source.COGNITO_REGION,
    approvalReference: source.SEED_BOOTSTRAP_OWNER_APPROVAL_REFERENCE,
  });
  if (!parsed.success)
    throw new Error('Production bootstrap identity and pool configuration is invalid.');
  return parsed.data;
}

/** The privileged initial-bootstrap operator supplies exact provider evidence, never an email Map. */
export async function verifyBootstrapIdentity(input: BootstrapAdmin): Promise<void> {
  const client = new CognitoIdentityProviderClient({ region: input.region, maxAttempts: 1 });
  try {
    const account = await client.send(
      new AdminGetUserCommand({ UserPoolId: input.userPoolId, Username: input.email }),
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    const attrs = new Map(
      account.UserAttributes?.map((attribute) => [attribute.Name, attribute.Value]),
    );
    if (
      !account.Username ||
      account.Enabled !== true ||
      !['CONFIRMED', 'FORCE_CHANGE_PASSWORD'].includes(account.UserStatus ?? '') ||
      attrs.get('sub') !== input.subject ||
      attrs.get('email')?.trim().toLowerCase() !== input.email ||
      attrs.get('email_verified') !== 'true' ||
      attrs.get('name') !== input.displayName
    )
      throw new Error('Bootstrap identity proof did not match.');
  } finally {
    client.destroy();
  }
}

async function replayExistingAdmin(
  tx: Prisma.TransactionClient,
  input: BootstrapAdmin,
  personId: string,
): Promise<string> {
  await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${personId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "OrganisationMembership" WHERE "organisationId" = ${input.organisationId}
    AND "personId" = ${personId} FOR SHARE`;
  const current = await tx.person.findUniqueOrThrow({ where: { id: personId } });
  const membership = await tx.organisationMembership.findUnique({
    where: {
      organisationId_personId: { organisationId: input.organisationId, personId },
    },
  });
  if (
    current.cognitoSub !== input.subject ||
    current.email.toLowerCase() !== input.email ||
    current.displayName !== input.displayName ||
    current.deactivatedAt ||
    current.piiErasedAt ||
    membership?.role !== 'PLATFORM_ADMIN'
  )
    throw new Error('Existing identities require the audited administration or recovery workflow.');
  return current.id;
}

/** Bootstrap may create the first administrator or repeat that exact state. It never promotes an existing account. */
export async function bootstrapProductionAdmin(
  prisma: PrismaClient,
  input: BootstrapAdmin,
): Promise<string> {
  input = validateBootstrapAdmin(input);
  await verifyBootstrapIdentity(input);
  return prisma.$transaction(async (tx) => {
    const key = `initial-platform-admin:${input.organisationId}`;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    await tx.$queryRaw`SELECT id FROM "Event" WHERE "organisationId" = ${input.organisationId} ORDER BY id FOR SHARE`;
    // Preserve the organisation without blocking FK key-share locks behind a held Person.
    await tx.$queryRaw`SELECT id FROM "Organisation" WHERE id = ${input.organisationId} FOR NO KEY UPDATE`;
    const organisation = await tx.organisation.findUnique({
      where: { id: input.organisationId },
      select: { id: true },
    });
    if (!organisation) throw new Error('The explicit bootstrap organisation does not exist.');
    const matches = await tx.person.findMany({
      where: {
        OR: [
          { email: { equals: input.email, mode: 'insensitive' } },
          { cognitoSub: input.subject },
        ],
      },
      select: { id: true },
    });
    if (matches.length > 1) throw new Error('Bootstrap identity collision requires review.');
    if (matches[0]) return replayExistingAdmin(tx, input, matches[0].id);
    if (
      await tx.organisationMembership.count({
        where: { organisationId: input.organisationId, role: 'PLATFORM_ADMIN' },
      })
    )
      throw new Error('Initial bootstrap cannot add another administrator.');
    const person = await tx.person.create({
      data: { email: input.email, displayName: input.displayName, cognitoSub: input.subject },
    });
    await tx.organisationMembership.create({
      data: { organisationId: input.organisationId, personId: person.id, role: 'PLATFORM_ADMIN' },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        actorSub: 'bootstrap',
        source: 'SYSTEM',
        eventId: null,
        membershipId: null,
        action: 'user.provision',
        entityType: 'Person',
        entityId: person.id,
        requestId: randomUUID(),
        after: {
          initialBootstrap: true,
          organisationId: input.organisationId,
          approvalDigest: createHash('sha256').update(input.approvalReference).digest('hex'),
        },
      },
    });
    // A new Person has no cached credentials or memberships to invalidate.
    return person.id;
  });
}

export function validateBootstrapAdmin(input: unknown): BootstrapAdmin {
  const verified = bootstrapSchema.safeParse(input);
  if (!verified.success)
    throw new Error('Production bootstrap identity and pool configuration is invalid.');
  return verified.data;
}
