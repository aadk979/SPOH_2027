/**
 * Name a middleware closure after what it checks.
 *
 * A factory such as `requireCapability('report.generate')` returns an anonymous
 * arrow, so a stack trace, a debugger and the route inventory
 * (`remediation/tools/route-inventory.mjs`) all saw `<anonymous>` where the
 * chain's meaning was. The name is the only thing this changes.
 */
export function named<T extends (...args: never[]) => unknown>(name: string, fn: T): T {
  Object.defineProperty(fn, 'name', { value: name });
  return fn;
}
