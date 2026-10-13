import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const RecoveryPlan = z.object({
  version: z.literal(1),
  planId: z.uuid(),
  plannedAt: z.iso.datetime(),
  organisationId: z.string().min(1).max(128),
  targetPoolId: z.string().regex(/^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/),
  items: z.array(z.object({
    personId: z.string().min(1).max(128),
    profileDigest: digest,
    expectedSubjectDigest: digest,
  }).strict()).max(1000),
}).strict().superRefine((plan, context) => {
  if (new Set(plan.items.map((item) => item.personId)).size !== plan.items.length)
    context.addIssue({ code: 'custom', path: ['items'], message: 'A person may appear only once.' });
});
export type RecoveryPlan = z.infer<typeof RecoveryPlan>;
export type RecoveryItem = RecoveryPlan['items'][number];

/** A reviewed plan expires; retries within its lifetime still recheck all current state. */
export function isRecentPlan(plan: RecoveryPlan, now: Date): boolean {
  const age = now.getTime() - Date.parse(plan.plannedAt);
  return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
}
