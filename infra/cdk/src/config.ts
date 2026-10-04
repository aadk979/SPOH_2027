/**
 * The two environments (ADR-008 §3), in one typed place. Everything a stack
 * varies by environment reads from here; nothing reads an env var.
 *
 * The unused domain placeholders predate D-08's Firebase client/DuckDNS API
 * amendment. Concrete production routing is supplied before the approved cutover;
 * staging uses the separate explicit edge names below. No Route 53 domain is required.
 */
export type StageName = 'staging' | 'prod';

export interface StageConfig {
  name: StageName;
  account: string;
  region: string;
  /** Resource tags (P08.1): who owns it and where the money goes. */
  tags: { app: string; env: StageName; owner: string; 'cost-centre': string };
  /** The app's hostname under the D-08 domain. */
  domainName: string;
  /** Verified public edge origins; omitted until a stage's routing is ready. */
  publicOrigins?: { api: string; client: string };
  /** ADR-008 §3 sizing, off-season; event days scale by owner-approved schedule (P08.4). */
  app: { cpu: number; memoryMiB: number; desiredCount: number };
  database: { instanceClass: string; allocatedStorageGiB: number; maxStorageGiB: number };
  /** Existing owner backups: reference only, without lifecycle, policy or task grants. */
  existingBackupsBucket: string;
  /** An existing Cognito pool this stage must reference and never own (P08 risk). */
  existingUserPoolId?: string;
  /** How the app reaches that existing pool; the domain is confirmed at cutover (P12). */
  existingCognito?: { userPoolId: string; clientId: string; domain: string };
}

const ACCOUNT = '665146708212';
const REGION = 'ap-southeast-1';
const DOMAIN = 'spoh.example.invalid';
const EXISTING_BACKUPS_BUCKET = 'spoh2027-backups-665146708212';

/**
 * The only repository whose workflows may deploy (P08.2), as GitHub's OIDC
 * `sub` claim names it: owner and repository with their immutable ids, so a
 * renamed or re-created repository of the same name cannot match.
 */
export const REPOSITORY = 'aadk979@138833125/SPOH_2027@1379786785';

export const ACCOUNT_ENV = { account: '665146708212', region: 'ap-southeast-1' };

/** D-08 staging proxy only; production creation still waits for the owner go decision. */
export const STAGING_EDGE = {
  instanceName: 'spoh-staging-edge',
  staticIpName: 'spoh-staging-edge-ip',
  clientHost: 'secure-channel.duckdns.org',
  apiHost: 'api.secure-channel.duckdns.org',
  bundleId: 'micro_3_0',
  blueprintId: 'ubuntu_24_04',
} as const;

const tags = (env: StageName): StageConfig['tags'] => ({
  app: 'spoh-platform',
  env,
  owner: 'spoh-2027-committee',
  'cost-centre': 'spoh-2027',
});

export const STAGES: Record<StageName, StageConfig> = {
  staging: {
    name: 'staging',
    account: ACCOUNT,
    region: REGION,
    tags: tags('staging'),
    domainName: `staging.${DOMAIN}`,
    publicOrigins: {
      api: `https://${STAGING_EDGE.apiHost}`,
      client: `https://${STAGING_EDGE.clientHost}`,
    },
    app: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
    database: { instanceClass: 't4g.micro', allocatedStorageGiB: 20, maxStorageGiB: 100 },
    existingBackupsBucket: EXISTING_BACKUPS_BUCKET,
  },
  prod: {
    name: 'prod',
    account: ACCOUNT,
    region: REGION,
    tags: tags('prod'),
    domainName: DOMAIN,
    app: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    database: { instanceClass: 't4g.micro', allocatedStorageGiB: 20, maxStorageGiB: 100 },
    existingBackupsBucket: EXISTING_BACKUPS_BUCKET,
    // Every Volunteer.cognitoSub points into this pool: referenced, never replaced.
    existingUserPoolId: 'ap-southeast-1_9bwl2nGF7',
    existingCognito: {
      userPoolId: 'ap-southeast-1_9bwl2nGF7',
      clientId: '23uft7mvtnrno1uunsc5lp0h2v',
      // Placeholder until the owner confirms the production Hosted UI domain (P12.2).
      domain: 'https://auth.spoh.example.invalid',
    },
  },
};
