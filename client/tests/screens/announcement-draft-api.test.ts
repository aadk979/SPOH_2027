import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changeAnnouncementSchedule,
  cancelAnnouncementSchedule,
  listAnnouncementDrafts,
  listAnnouncementSchedules,
  replaceAnnouncementDraft,
} from '@/features/announcements/api';
import { api } from '@/shared/lib/api';
import { PRIVATE_DRAFT, PRIVATE_SCHEDULE } from '../helpers/announcement';
import { TEST_EVENT } from '../helpers/event';

vi.mock('@/shared/lib/api', () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);
const path = `/events/${TEST_EVENT.id}/announcements/drafts`;
beforeEach(() => mockedApi.mockReset());
describe('private announcement API boundaries', () => {
  it('encodes opaque list cursors without adding query fields', async () => {
    mockedApi.mockResolvedValue({ data: [PRIVATE_DRAFT], meta: { count: 1, nextCursor: null } });
    expect((await listAnnouncementDrafts(TEST_EVENT.id, 'fixture&limit=200')).data).toEqual([
      PRIVATE_DRAFT,
    ]);
    expect(mockedApi).toHaveBeenCalledWith(`${path}?limit=10&cursor=fixture%26limit%3D200`);
  });
  it('encodes private route identifiers on schedule reads', async () => {
    mockedApi.mockResolvedValue({ data: [], meta: { count: 0, nextCursor: null } });
    await listAnnouncementSchedules(TEST_EVENT.id, 'fixture/other');
    expect(mockedApi).toHaveBeenCalledWith(`${path}/fixture%2Fother/schedules?limit=10`);
  });
  it('uses PUT with separate reviewed action and content versions', async () => {
    mockedApi.mockResolvedValue({ schedule: PRIVATE_SCHEDULE });
    const request = { expectedVersion: 3, expectedDraftVersion: 2, runAt: PRIVATE_SCHEDULE.runAt };
    await changeAnnouncementSchedule(TEST_EVENT.id, {
      id: 'fixture/other',
      scheduleId: 'action/other',
      request,
    });
    expect(mockedApi).toHaveBeenCalledWith(`${path}/fixture%2Fother/schedules/action%2Fother`, {
      method: 'PUT',
      body: request,
    });
  });
  it('cancels through an explicit POST with the current action version', async () => {
    mockedApi.mockResolvedValue({ schedule: { ...PRIVATE_SCHEDULE, status: 'CANCELLED' } });
    await cancelAnnouncementSchedule(TEST_EVENT.id, {
      id: PRIVATE_DRAFT.id,
      scheduleId: PRIVATE_SCHEDULE.id,
      request: { expectedVersion: 3 },
    });
    expect(mockedApi).toHaveBeenCalledWith(
      `${path}/${PRIVATE_DRAFT.id}/schedules/${PRIVATE_SCHEDULE.id}/cancel`,
      { method: 'POST', body: { expectedVersion: 3 } },
    );
  });
  it('refuses unexpected private schedule payloads or raw error strings', async () => {
    mockedApi.mockResolvedValueOnce({
      schedule: { ...PRIVATE_SCHEDULE, payload: { body: 'Private fixture' } },
    });
    const input = {
      id: PRIVATE_DRAFT.id,
      scheduleId: PRIVATE_SCHEDULE.id,
      request: { expectedVersion: 3 },
    };
    await expect(cancelAnnouncementSchedule(TEST_EVENT.id, input)).rejects.toThrow();
    mockedApi.mockResolvedValueOnce({
      schedule: { ...PRIVATE_SCHEDULE, lastError: 'Raw SQL fixture' },
    });
    await expect(cancelAnnouncementSchedule(TEST_EVENT.id, input)).rejects.toThrow();
  });
  it('validates returned saved content rather than trusting a cast', async () => {
    mockedApi.mockResolvedValue({ draft: { ...PRIVATE_DRAFT, version: 0 } });
    await expect(
      replaceAnnouncementDraft(TEST_EVENT.id, PRIVATE_DRAFT.id, {
        body: 'Reviewed fixture',
        priority: 'INFO',
        target: {},
        requiresAck: false,
        expectedVersion: 2,
      }),
    ).rejects.toThrow();
  });
});
