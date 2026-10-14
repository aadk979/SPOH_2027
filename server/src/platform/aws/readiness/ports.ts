import type { CloudReadinessConfig } from '../../../config/schemas/readiness.js';

export interface CloudReadinessSnapshot {
  selection: Pick<CloudReadinessConfig, 'deploymentId' | 'databaseId' | 'requiredAlarmIds' | 'freshness'>;
  smoke?: { deploymentId: string; observedAtMs: number; passed: boolean };
  backups?: { databaseId: string; observedAtMs: number; restorableThroughMs: number | null };
  alarms?: { deploymentId: string; observedAtMs: number;
    alarms: Array<{ id: string; state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA' }> };
}
export interface CloudReadinessReaders {
  smoke(signal: AbortSignal): Promise<CloudReadinessSnapshot['smoke']>;
  backups(signal: AbortSignal): Promise<CloudReadinessSnapshot['backups']>;
  alarms(signal: AbortSignal): Promise<CloudReadinessSnapshot['alarms']>;
}

async function bounded<T>(reader: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) {
  let expired: (() => void) | undefined;
  const timeout = new Promise<undefined>(resolve => {
    expired = () => resolve(undefined);
    signal.addEventListener('abort', expired, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => reader(signal)).catch(() => undefined), timeout]);
  } finally {
    if (expired) signal.removeEventListener('abort', expired);
  }
}

/** A failed domain loses its own facts, never reuses a previous passing observation. */
export async function collectCloudReadiness(config: CloudReadinessConfig, readers: CloudReadinessReaders) {
  const signal = AbortSignal.timeout(8_000);
  const [smoke, backups, alarms] = await Promise.all([
    bounded(readers.smoke, signal), bounded(readers.backups, signal), bounded(readers.alarms, signal),
  ]);
  const snapshot: CloudReadinessSnapshot = { selection: {
    deploymentId: config.deploymentId, databaseId: config.databaseId,
    requiredAlarmIds: [...config.requiredAlarmIds], freshness: { ...config.freshness } },
    ...(smoke ? { smoke } : {}), ...(backups ? { backups } : {}), ...(alarms ? { alarms } : {}),
  };
  return snapshot;
}
