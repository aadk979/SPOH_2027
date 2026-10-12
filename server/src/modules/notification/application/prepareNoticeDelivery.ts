import { DEFAULT_NOTICE_PREFERENCE } from '@spoh/shared';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import type { NoticeSourceReaders } from '../../../platform/notification/sourceReader.js';
import type { Clock } from '../../../platform/time/index.js';
import { finishNoticeDelivery, lockedNoticeDelivery, noticeDevice, reserveNoticeSend,
  type NoticeClaim } from '../data/noticeDeliveryRepo.js';
import { noticePreference } from '../data/noticeStandingRepo.js';
import { preferenceAllows, pushKind } from '../domain/noticeDelivery.js';
import { readNoticeSource } from './noticeSource.js';
import { sourceInput } from './noticeProjection.js';
import type { DevicePushInput } from './sendDevicePush.js';

type Locked = NonNullable<Awaited<ReturnType<typeof lockedNoticeDelivery>>>;
type Visible = NonNullable<Awaited<ReturnType<typeof readNoticeSource>>>;
function sourceRefusal(locked: Locked, source: Visible | null) {
  if (!source) return 'SOURCE_UNAVAILABLE' as const;
  if (source.event.status === 'ARCHIVED') return 'ARCHIVED' as const;
  const member = source.event.memberships[0];
  if (locked.row.notice.kind !== 'ARCHIVE_REMINDER' && (member?.status !== 'ACTIVE'
    || member.id !== locked.row.membershipId)) return 'RECIPIENT_INACTIVE' as const;
  return null;
}
function pushRefusal(locked: Locked, push: Visible['source']['push']) {
  if (!push || push.kind !== pushKind(locked.row.notice.kind, locked.row.notice.priority)
    || push.priority !== locked.row.notice.priority) return 'SOURCE_CHANGED' as const;
  return push.validUntil && push.validUntil <= locked.now ? 'EXPIRED' as const : null;
}
async function prepareDevice(tx: PrismaTransactionClient, input: { locked: Locked; source: Visible }) {
  const { row } = input.locked;
  const push = input.source.source.push;
  const refusal = pushRefusal(input.locked, push);
  if (refusal || !push) return { refusal: refusal ?? 'SOURCE_CHANGED' as const };
  const device = row.subscriptionId ? await noticeDevice(tx, row.subscriptionId) : null;
  if (!device) return { refusal: 'SUBSCRIPTION_GONE' as const };
  if (device.volunteerId !== row.recipientPersonId) return { refusal: 'SUBSCRIPTION_REASSIGNED' as const };
  const expiresAt = new Date(Math.min(row.expiresAt.getTime(), push.validUntil?.getTime() ?? Infinity));
  const send: Omit<DevicePushInput, 'ttlSeconds'> = { target: { endpoint: device.endpoint,
    keys: { p256dh: device.p256dh, auth: device.auth } }, payload: {
    kind: push.kind, priority: push.priority, title: push.title, body: push.body, tag: push.tag,
    url: `/notifications?notice=${encodeURIComponent(row.noticeId)}` } };
  return { send, device, expiresAt };
}

async function prepareCurrentSource(tx: PrismaTransactionClient, input: {
  locked: Locked;
  sourceReaders: NoticeSourceReaders;
}) {
  const { row, now } = input.locked;
  if (row.expiresAt <= now) return { refusal: 'EXPIRED' as const };
  if (row.recipientPersonId !== row.notice.recipientPersonId) return { refusal: 'RECIPIENT_OUT_OF_SCOPE' as const };
  const preference = await noticePreference(tx, row.recipientPersonId) ?? DEFAULT_NOTICE_PREFERENCE;
  if (!preferenceAllows(row.notice.priority, preference)) return { refusal: 'PUSH_DISABLED' as const };
  const source = await readNoticeSource({ eventId: row.eventId, row: sourceInput(row.notice),
    db: tx, now, sourceReaders: input.sourceReaders });
  const refusal = sourceRefusal(input.locked, source);
  if (refusal || !source) return { refusal: refusal ?? 'SOURCE_UNAVAILABLE' as const };
  return prepareDevice(tx, { locked: input.locked, source });
}

export function prepareNoticeDelivery(input: { claim: NoticeClaim; clock: Clock; sourceReaders: NoticeSourceReaders }) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockedNoticeDelivery(tx, { claim: input.claim, now: () => input.clock.now() });
    if (!locked) return { kind: 'STALE' as const };
    if (input.claim.exhausted) return { kind: await finishNoticeDelivery(tx, {
      claim: input.claim, now: locked.now, outcome: { status: 'DEAD', lastError: 'RETRY_EXHAUSTED' } }) };
    const ready = await prepareCurrentSource(tx, { locked, sourceReaders: input.sourceReaders });
    if (ready.refusal) return { kind: await finishNoticeDelivery(tx, {
      claim: input.claim, now: locked.now, outcome: { status: 'SKIPPED', lastError: ready.refusal } }) };
    return { kind: 'SEND' as const, ...ready, claim: await reserveNoticeSend(tx, input.claim) };
  }, { isolationLevel: 'ReadCommitted', timeout: 10_000 });
}
