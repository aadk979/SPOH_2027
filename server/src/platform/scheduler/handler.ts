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
  validatePayload(payload: unknown): void;
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
  const parsePayload = (input: unknown) => {
    const payload = definition.schema.safeParse(input);
    if (!payload.success) throw new ScheduleRefusal('INVALID_PAYLOAD');
    return payload.data;
  };
  return Object.freeze({
    type: definition.type,
    validatePayload(input: unknown) {
      parsePayload(input);
    },
    async execute(context: ScheduleContext) {
      const payload = parsePayload(context.action.payload);
      await definition.authorize(context, payload);
      await definition.run(context, payload);
    },
  });
}
