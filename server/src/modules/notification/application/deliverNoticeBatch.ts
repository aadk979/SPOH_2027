import { prisma } from '../../../platform/db/client.js';
import { logger } from '../../../platform/logger/index.js';
import type { NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { claimNoticeRows, finishNoticeDelivery, pruneNoticeDevice, type NoticeClaim } from '../data/noticeDeliveryRepo.js';
import { noticePushOutcome } from '../domain/noticeOutcome.js';
import { prepareNoticeDelivery } from './prepareNoticeDelivery.js';
import { sendDevicePush, type DevicePushInput, type DevicePushResult } from './sendDevicePush.js';

export async function executeNoticeDelivery(input: { claim: NoticeClaim; sourceReaders: NoticeSourceReaders;
  clock?: Clock; send?: (input: DevicePushInput) => Promise<DevicePushResult> }) {
  const clock = input.clock ?? systemClock;
  const prepared = await prepareNoticeDelivery({ ...input, clock });
  if (prepared.kind !== 'SEND') return prepared.kind;
  const now = clock.now();
  if (now > prepared.claim.lockedUntil) return 'STALE';
  const ttlSeconds = Math.floor((prepared.expiresAt.getTime() - now.getTime()) / 1000);
  let result: DevicePushResult = 'FAILED';
  if (ttlSeconds > 0) {
    try { result = await (input.send ?? sendDevicePush)({ ...prepared.send, ttlSeconds }); }
    catch { result = 'FAILED'; }
  }
  const outcome = ttlSeconds > 0 ? noticePushOutcome(result, { now: clock.now(),
    expiresAt: prepared.expiresAt, attempts: prepared.claim.attempts, maxAttempts: prepared.claim.maxAttempts })
    : { status: 'SKIPPED' as const, lastError: 'EXPIRED' as const };
  const status = await prisma.$transaction((tx) => finishNoticeDelivery(tx, {
    claim: prepared.claim, now: clock.now(), outcome }));
  if (result === 'GONE' && status === 'SKIPPED') await pruneNoticeDevice(prepared.device);
  return status;
}

/** Scheduler afterActions supplies one owner; external sends happen after source/claim commits. */
export async function deliverNoticeBatch(input: { workerId: string; sourceReaders: NoticeSourceReaders; clock?: Clock }) {
  const clock = input.clock ?? systemClock;
  const now = clock.now();
  const claims = await prisma.$transaction((tx) => claimNoticeRows(tx, {
    workerId: input.workerId, now, leaseUntil: new Date(now.getTime() + 60_000) }));
  for (const claim of claims) {
    try { await executeNoticeDelivery({ claim, clock, sourceReaders: input.sourceReaders }); }
    catch { logger.error({ code: 'NOTICE_DELIVERY_FAILED' }, 'notification delivery failed'); }
  }
}
