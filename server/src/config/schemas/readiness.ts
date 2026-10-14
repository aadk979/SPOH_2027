import { z } from 'zod';

const freshness = z.number().int().positive().max(300_000);
export const CloudReadinessConfig = z.object({
  region: z.string().regex(/^[a-z]{2}-(?:[a-z]+-)+[1-9]\d*$/),
  account: z.string().regex(/^\d{12}$/),
  nativeOrigin: z.string(),
  deploymentId: z.string().regex(/^[a-f0-9]{40}$/),
  databaseIdentifier: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
  databaseId: z.string(),
  requiredAlarmIds: z.array(z.string()).min(1).max(100),
  freshness: z.object({ smokeMaxAgeMs: freshness, backupMaxAgeMs: freshness,
    alarmsMaxAgeMs: freshness }).strict(),
}).strict().superRefine((config, context) => {
  const database = `arn:aws:rds:${config.region}:${config.account}:db:${config.databaseIdentifier}`;
  const alarm = `arn:aws:cloudwatch:${config.region}:${config.account}:alarm:spoh-`;
  if (config.databaseId !== database) context.addIssue({ code: 'custom', path: ['databaseId'],
    message: 'readiness database must match the selected account, region and identifier' });
  if (!new RegExp(`^https://[a-z0-9]+\\.execute-api\\.${config.region}\\.amazonaws\\.com$`).test(config.nativeOrigin)) {
    context.addIssue({ code: 'custom', path: ['nativeOrigin'], message: 'readiness requires its canonical regional native API origin' });
  }
  if (new Set(config.requiredAlarmIds).size !== config.requiredAlarmIds.length ||
      config.requiredAlarmIds.some(id => !id.startsWith(alarm) || !/^[-a-z0-9]+$/.test(id.slice(alarm.length)))) {
    context.addIssue({ code: 'custom', path: ['requiredAlarmIds'], message: 'readiness requires unique selected regional alarm ARNs' });
  }
});
export type CloudReadinessConfig = z.infer<typeof CloudReadinessConfig>;

export const readinessFields = {
  READINESS_CLOUD_CONFIG: z.string().optional().transform((value, context) => {
    if (value === undefined || value === '') return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      const config = CloudReadinessConfig.safeParse(parsed);
      if (config.success) return config.data;
    } catch { /* Report a fixed configuration problem, never a raw provider value. */ }
    context.addIssue({ code: 'custom', message: 'requires a complete, strictly selected cloud readiness configuration' });
    return z.NEVER;
  }),
};
