/**
 * The two environments (ADR-008 §3), in one typed place. Everything a stack
 * varies by environment reads from here; nothing reads an env var.
 *
 * The production domain is still a placeholder: D-08 chose a Route 53 domain
 * but the owner has not named it, and P08.5/P12.2 build against this value
 * until they do (the P08 report flags it).
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
  /** ADR-008 §3 sizing, off-season; event days scale by owner-approved schedule (P08.4). */
  app: { cpu: number; memoryMiB: number; desiredCount: number };
  database: { instanceClass: string; allocatedStorageGiB: number; maxStorageGiB: number };
  /** An existing Cognito pool this stage must reference and never own (P08 risk). */
  existingUserPoolId?: string;
}

const ACCOUNT = '665146708212';
const REGION = 'ap-southeast-1';
const DOMAIN = 'spoh.example.invalid';

/**
 * The only repository whose workflows may deploy (P08.2), as GitHub's OIDC
 * `sub` claim names it: owner and repository with their immutable ids, so a
 * renamed or re-created repository of the same name cannot match.
 */
export const REPOSITORY = 'aadk979@138833125/SPOH_2027@1379786785';

export const ACCOUNT_ENV = { account: '665146708212', region: 'ap-southeast-1' };

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
    app: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
    database: { instanceClass: 't4g.micro', allocatedStorageGiB: 20, maxStorageGiB: 100 },
  },
  prod: {
    name: 'prod',
    account: ACCOUNT,
    region: REGION,
    tags: tags('prod'),
    domainName: DOMAIN,
    app: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
    database: { instanceClass: 't4g.micro', allocatedStorageGiB: 20, maxStorageGiB: 100 },
    // Every Volunteer.cognitoSub points into this pool: referenced, never replaced.
    existingUserPoolId: 'ap-southeast-1_9bwl2nGF7',
  },
};
