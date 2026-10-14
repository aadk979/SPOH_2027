import { taskObservation, backupObservation, UNKNOWN_BACKUP_AGE_SECONDS } from './observation.mjs';
export { observation } from './observation.mjs';

async function completedBackups(listBackups) {
  const recoveryPoints = [];
  const tokens = new Set();
  let nextToken;
  do {
    if (tokens.size >= 20) throw new Error('Backup pagination exceeded its bound');
    const page = await listBackups(nextToken);
    if (!page || !Array.isArray(page.RecoveryPoints)) throw new Error('Backup metadata is unavailable');
    recoveryPoints.push(...page.RecoveryPoints);
    nextToken = page.NextToken;
    if (nextToken !== undefined && (typeof nextToken !== 'string' || !nextToken || tokens.has(nextToken))) {
      throw new Error('Backup pagination is malformed');
    }
    if (nextToken) tokens.add(nextToken);
  } while (nextToken);
  return recoveryPoints;
}

/** Preserve an independently observed task metric while making unknown backups alarmable. */
export async function collect({ describeService, listBackups, publish, now }) {
  const [task, backup] = await Promise.allSettled([
    Promise.resolve().then(describeService).then(taskObservation),
    completedBackups(listBackups).then(points => backupObservation(points, now ?? Date.now())),
  ]);
  const metrics = [];
  if (task.status === 'fulfilled') metrics.push(task.value);
  if (backup.status === 'fulfilled') metrics.push(backup.value);
  else if (task.status === 'fulfilled') metrics.push({
    MetricName: 'BackupAgeSeconds', Unit: 'Seconds', Value: UNKNOWN_BACKUP_AGE_SECONDS,
  });
  if (metrics.length) await publish(metrics);
  if (task.status === 'rejected') throw task.reason;
  if (backup.status === 'rejected') throw backup.reason;
}

export async function handler() {
  return (await import('./runtime.mjs')).handler();
}
