import { z } from 'zod';
import type { EnvRule } from './common.js';

/** Web Push. */
export const pushFields = {
  /**
   * VAPID keys for Web Push. Absent means push is simply off — the ten-second
   * alert poll and the three-second dashboard poll are the contract either
   * way, so an unconfigured deployment is a quieter system, not a broken one.
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** `mailto:` or `https:` contact the push service can reach, per RFC 8292. */
  VAPID_SUBJECT: z.string().optional(),
};

type PushEnv = z.infer<z.ZodObject<typeof pushFields>>;

export const vapidRule: EnvRule<PushEnv> = (env, ctx) => {
  // Half a VAPID pair is a misconfiguration that would otherwise surface as
  // silent non-delivery of exactly the alerts that matter most.
  const vapid = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
  if (vapid.some(Boolean) && !vapid.every(Boolean)) {
    ctx.addIssue({
      code: 'custom',
      path: ['VAPID_PUBLIC_KEY'],
      message:
        'set all three of VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT, or none of them',
    });
  }
};
