import { z } from 'zod';
import { bootstrapAdminConfiguration, validateBootstrapAdmin, type BootstrapAdmin } from './bootstrapAdmin.js';

export interface RestoredOperator extends BootstrapAdmin {
  personId: string; expectedSubject: string; operationId: string; reason: string;
}
const extra = z.object({ personId: z.string().trim().min(1).max(128), expectedSubject: z.uuid(),
  operationId: z.uuid(), reason: z.string().trim().min(1).max(512) });

export function validateRestoredOperator(input: RestoredOperator): RestoredOperator {
  const parsed = extra.safeParse(input);
  if (!parsed.success) throw new Error('Restored operator requires exact reviewed Person, prior subject, operation and reason.');
  return { ...validateBootstrapAdmin(input), ...parsed.data };
}

/** Separate explicit offline operation; ordinary production seed never selects this path. */
export function restoredOperatorConfiguration(source: NodeJS.ProcessEnv): RestoredOperator {
  if (source.NODE_ENV !== 'production' || source.SEED_BOOTSTRAP_MODE !== 'restored-operator')
    throw new Error('Restored operator bootstrap requires an explicit production operator mode.');
  return validateRestoredOperator({ ...bootstrapAdminConfiguration(source),
    personId: source.SEED_RECOVERY_OPERATOR_PERSON_ID ?? '',
    expectedSubject: source.SEED_RECOVERY_OPERATOR_EXPECTED_SUBJECT ?? '',
    operationId: source.SEED_RECOVERY_OPERATOR_OPERATION_ID ?? '',
    reason: source.SEED_RECOVERY_OPERATOR_REASON ?? '' });
}
