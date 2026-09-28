/** Date-only clock for the visual fixture API and seed. Timers still run normally. */
const database = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid').pathname;
if (!database.endsWith('_test') || process.env.NODE_ENV === 'production') {
  throw new Error('Visual fixture clock requires a disposable *_test database outside production');
}
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
