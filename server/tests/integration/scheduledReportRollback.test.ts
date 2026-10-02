import { beforeEach, expect, it, vi } from 'vitest';
import * as audit from '../../src/platform/audit/index.js';
import * as executionRepo from '../../src/platform/scheduler/executionRepo.js';
import * as report from '../../src/modules/report/application/generateReport.js';
import * as snapshotRepo from '../../src/modules/report/data/dailySnapshotRepo.js';
import { resetDatabase } from '../helpers/db.js';
import { scheduledReportFixture, type ScheduledReportFixture } from '../helpers/scheduledReport.js';

let f: ScheduledReportFixture;
beforeEach(async () => {
  await resetDatabase();
  f = await scheduledReportFixture();
});

it.each(['generation', 'storage', 'module audit', 'completion', 'outcome audit'])(
  'rolls the snapshot and all receipts back on %s failure, then retries once',
  async (stage) => {
    await f.registration();
    const row = await f.create();
    const originalGenerate = report.generateReportInTransaction;
    const originalSave = snapshotRepo.saveDailySnapshot;
    const originalAudit = audit.writeAudit;
    const fault = new Error('private report fault');
    const spy =
      stage === 'generation'
        ? vi
            .spyOn(report, 'generateReportInTransaction')
            .mockImplementationOnce(async (...args) => {
              await originalGenerate(...args);
              throw fault;
            })
        : stage === 'storage'
          ? vi.spyOn(snapshotRepo, 'saveDailySnapshot').mockImplementationOnce(async (...args) => {
              await originalSave(...args);
              throw fault;
            })
          : stage === 'completion'
            ? vi.spyOn(executionRepo, 'finishAction').mockRejectedValueOnce(fault)
            : vi.spyOn(audit, 'writeAudit').mockImplementation(async (tx, input) => {
                if (
                  input.action ===
                  (stage === 'module audit' ? 'report.snapshot' : 'schedule.execute')
                ) {
                  spy.mockRestore();
                  throw fault;
                }
                return originalAudit(tx, input);
              });
    try {
      expect(await f.run()).toBe('PENDING');
    } finally {
      spy.mockRestore();
    }
    expect(await f.snapshots()).toEqual([]);
    expect((await f.receipts(row.id)).map((entry) => entry.action)).toEqual(['schedule.execute']);
    expect(JSON.stringify(await f.receipts(row.id))).not.toContain('private report fault');
    const pending = await f.action(row.id);
    expect(pending.lastError).toBe('EXECUTION_FAILED');
    expect(await f.run(pending.runAt)).toBe('SUCCEEDED');
    expect(await f.snapshots()).toHaveLength(1);
    expect(
      (await f.receipts(row.id)).filter((entry) => entry.action === 'report.snapshot'),
    ).toHaveLength(1);
    expect((await f.snapshots())[0]?.createdAt).toEqual(pending.runAt);
  },
);
