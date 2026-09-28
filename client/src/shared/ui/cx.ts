/**
 * Class-name joining.
 *
 * Deliberately not `clsx` — this is eight lines, it is used on every render of
 * every component, and the dependency it replaces is a network fetch on a
 * congested hall network for a volunteer opening the app for the first time.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
