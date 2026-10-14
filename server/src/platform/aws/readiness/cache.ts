import type { CloudReadinessSnapshot } from './ports.js';

/** One in-flight read per process; callers receive independent copies, including failure snapshots. */
export function cloudReadinessCache(input: { collect: () => Promise<CloudReadinessSnapshot>;
  now: () => number; maxAgeMs: number }) {
  let completedAt: number | undefined;
  let snapshot: CloudReadinessSnapshot | undefined;
  let running: Promise<CloudReadinessSnapshot> | undefined;
  return async () => {
    const age = completedAt === undefined ? Infinity : input.now() - completedAt;
    if (snapshot && age >= 0 && age < input.maxAgeMs) return structuredClone(snapshot);
    running ??= input.collect().then(value => {
      snapshot = structuredClone(value); completedAt = input.now(); return value;
    }).finally(() => { running = undefined; });
    return structuredClone(await running);
  };
}
