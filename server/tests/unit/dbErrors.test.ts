import { describe, expect, it } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { fromDatabaseError } from '../../src/platform/db/errors.js';

/** F03-002: unique violations and missing records are the caller's fault, not a 500. */

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: 'test', meta });
}

const adapterUnique = (index: string, modelName: string) =>
  prismaError('P2002', { modelName, driverAdapterError: { cause: { constraint: { index } } } });

describe('fromDatabaseError', () => {
  it('names the clash when the constraint has its own code', () => {
    expect(fromDatabaseError(adapterUnique('GiftType_eventId_name_key', 'GiftType'))).toMatchObject(
      {
        statusCode: 409,
        code: 'GIFT_TYPE_EXISTS',
      },
    );
    expect(
      fromDatabaseError(
        prismaError('P2002', { modelName: 'EventDay', target: ['eventId', 'date'] }),
      ),
    ).toMatchObject({ statusCode: 409, code: 'EVENT_DAY_EXISTS' });
  });

  it('answers any other unique violation with CONFLICT', () => {
    expect(fromDatabaseError(adapterUnique('Station_eventId_code_key', 'Station'))).toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });

  it('answers a missing record with 404', () => {
    expect(fromDatabaseError(prismaError('P2025'))).toMatchObject({ statusCode: 404 });
  });

  it('leaves real faults alone', () => {
    expect(fromDatabaseError(prismaError('P1001'))).toBeNull();
    expect(fromDatabaseError(new Error('boom'))).toBeNull();
  });
});
