import type { z } from 'zod';
import type { AuditContext } from '../audit/index.js';
import type { PrismaTransactionClient } from '../db/client.js';
import type { ClaimedAction } from './claimRepo.js';
import { ScheduleRefusal } from './failure.js';

export interface ScheduleContext {
  readonly tx: PrismaTransactionClient;
  readonly action: ClaimedAction;
  readonly now: Date;
  readonly audit: Readonly<AuditContext>;
}

export interface ScheduledHandler {
  readonly type: string;
  execute(context: ScheduleContext): Promise<void>;
}

/** Authority is mandatory and runs against current rows in the handler's transaction. */
export function defineScheduledHandler<T>(definition: {
  type: string;
  schema: z.ZodType<T>;
  authorize(context: ScheduleContext, payload: T): Promise<void>;
  run(context: ScheduleContext, payload: T): Promise<void>;
}): ScheduledHandler {
  if (!/^[a-zA-Z][a-zA-Z0-9.]{0,99}$/.test(definition.type)) {
    throw new Error('Invalid scheduled handler type');
  }
  return Object.freeze({
    type: definition.type,
    async execute(context: ScheduleContext) {
      const payload = definition.schema.safeParse(context.action.payload);
      if (!payload.success) throw new ScheduleRefusal('INVALID_PAYLOAD');
      await definition.authorize(context, payload.data);
      await definition.run(context, payload.data);
    },
  });
}
