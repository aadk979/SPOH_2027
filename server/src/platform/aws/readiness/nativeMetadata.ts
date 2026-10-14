import type { CloudReadinessConfig } from '../../../config/schemas/readiness.js';
import type { CloudReadinessSnapshot } from './ports.js';
import { z } from 'zod';

export function restorableDatabase(config: CloudReadinessConfig, rows: unknown,
  observedAtMs: number): CloudReadinessSnapshot['backups'] {
  const database = z.object({ DBInstanceIdentifier: z.literal(config.databaseIdentifier),
    DBInstanceArn: z.literal(config.databaseId), DBInstanceStatus: z.literal('available'),
    StorageEncrypted: z.literal(true), PubliclyAccessible: z.literal(false),
    BackupRetentionPeriod: z.number().int().min(7), LatestRestorableTime: z.date() });
  const parsed = z.array(database).length(1).safeParse(rows);
  if (!parsed.success) throw new Error('Selected backup metadata is unavailable');
  return { databaseId: config.databaseId, observedAtMs,
    restorableThroughMs: parsed.data[0]!.LatestRestorableTime.getTime() };
}

export function selectedAlarms(config: CloudReadinessConfig, rows: unknown,
  observedAtMs: number): CloudReadinessSnapshot['alarms'] {
  const alarm = z.object({ AlarmArn: z.string().min(1), AlarmName: z.string().min(1),
    StateValue: z.enum(['OK', 'ALARM', 'INSUFFICIENT_DATA']) });
  const parsed = z.array(alarm).length(config.requiredAlarmIds.length).safeParse(rows);
  if (!parsed.success) throw new Error('Selected alarms are incomplete');
  const alarms = parsed.data.map(row => {
    if (!config.requiredAlarmIds.includes(row.AlarmArn) ||
        row.AlarmName !== row.AlarmArn.split(':alarm:')[1]) {
      throw new Error('Selected alarm metadata is malformed');
    }
    return { id: row.AlarmArn, state: row.StateValue };
  });
  if (new Set(alarms.map(row => row.id)).size !== alarms.length) throw new Error('Selected alarms are duplicated');
  return { deploymentId: config.deploymentId, observedAtMs, alarms };
}
