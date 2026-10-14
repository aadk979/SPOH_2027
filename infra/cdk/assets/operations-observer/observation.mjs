export const UNKNOWN_BACKUP_AGE_SECONDS = 27 * 3600;

export function taskObservation(service) {
  if (!service || !Number.isInteger(service.desiredCount) || service.desiredCount < 0 ||
      !Number.isInteger(service.runningCount) || service.runningCount < 0) {
    throw new Error('Service metadata is unavailable');
  }
  return { MetricName: 'RunningTaskDeficit', Unit: 'Count',
    Value: Math.max(0, service.desiredCount - service.runningCount) };
}

export function backupObservation(recoveryPoints, now) {
  if (!Number.isSafeInteger(now) || now < 0 || !Array.isArray(recoveryPoints)) {
    throw new Error('Backup metadata is unavailable');
  }
  const dates = recoveryPoints.filter(point => point.Status === 'COMPLETED').map(point => {
    if (!(point.CreationDate instanceof Date)) throw new Error('Backup timestamp is malformed');
    const instant = point.CreationDate.getTime();
    if (!Number.isSafeInteger(instant) || instant < 0 || instant > now) {
      throw new Error('Backup timestamp is malformed or in the future');
    }
    return instant;
  });
  const newest = dates.length ? Math.max(...dates) : null;
  return { MetricName: 'BackupAgeSeconds', Unit: 'Seconds',
    Value: newest === null ? UNKNOWN_BACKUP_AGE_SECONDS : (now - newest) / 1000 };
}

export const observation = ({ service, recoveryPoints, now }) =>
  [taskObservation(service), backupObservation(recoveryPoints, now)];
