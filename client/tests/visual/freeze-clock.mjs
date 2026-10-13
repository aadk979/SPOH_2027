import { testDatabaseEnvironment } from '../../../scripts/test-database-environment.mjs';

/** Date-only clock for the sole local fixture API/seed, never for real acceptance. */
testDatabaseEnvironment(process.env);
if (process.env.AUTH_PROVIDER !== 'local' || process.env.DEPLOYMENT_ENV !== 'development')
  throw new Error('Visual fixture clock requires explicit local auth/development.');
const RealDate = Date;
const instant = RealDate.parse('2026-09-28T02:00:00.000Z');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [instant]));
  }
  static now() {
    return instant;
  }
};
