import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, apiBlob } from '@/shared/lib/api';
import { ApiError, NetworkError } from '@/shared/lib/apiErrors';
import {
  getContentDraft,
  getPublishedContent,
  getContentImage,
  uploadContentImage,
  listContentVersions,
  saveContentDraft,
  reviewContent,
  publishContent,
  scheduleContent,
} from '@/features/content/api';
import { contentPointer, rememberContentVersion } from '@/features/content/model/contentPointer';
import { GUIDE_DRAFT, PUBLISHED_GUIDE, GUIDE } from '../helpers/content';
import { TEST_EVENT } from '../helpers/event';
vi.mock('@/shared/lib/api', () => ({ api: vi.fn(), apiBlob: vi.fn() }));
const call = vi.mocked(api);
const blob = vi.mocked(apiBlob);
const root = `/events/${TEST_EVENT.id}/content`;
const key = 'b46f6e32-e4cc-44b6-b06f-3d1ac9196f11'; // gitleaks:allow -- Synthetic idempotency UUID; grants no access.
beforeEach(() => {
  call.mockReset();
  blob.mockReset();
  localStorage.clear();
});
describe('published guide boundary', () => {
  it('loads latest then its immutable version and precaches floor plans', async () => {
    const record = {
      ...PUBLISHED_GUIDE,
      images: { photo: `/events/${TEST_EVENT.id}/content/assets/guide_version_1/map-0` },
    };
    call.mockResolvedValue({ data: record });
    blob.mockResolvedValue(new Blob(['floor']));
    expect(await getPublishedContent(TEST_EVENT.id, 'person_a')).toEqual({
      record,
      offline: false,
    });
    expect(call.mock.calls.map(([path]) => path)).toEqual([root, `${root}?v=guide_version_1`]);
    expect(blob).toHaveBeenCalledWith(record.images.photo, { offlineContent: true });
    expect(contentPointer(TEST_EVENT.id, 'person_a')).toBe(record.id);
    expect(contentPointer(TEST_EVENT.id, 'person_b')).toBeNull();
  });
  it('uses only this person and event version after a network failure', async () => {
    rememberContentVersion({
      eventId: TEST_EVENT.id,
      personId: 'person_a',
      id: PUBLISHED_GUIDE.id,
    });
    call
      .mockRejectedValueOnce(new NetworkError('offline'))
      .mockResolvedValueOnce({ data: PUBLISHED_GUIDE });
    expect((await getPublishedContent(TEST_EVENT.id, 'person_a')).offline).toBe(true);
    expect(call).toHaveBeenLastCalledWith(`${root}?v=guide_version_1`, {
      cache: 'no-store',
      offlineContent: true,
    });
  });
  it.each([403, 500])('keeps authoritative HTTP %i and never reads an old copy', async (status) => {
    rememberContentVersion({
      eventId: TEST_EVENT.id,
      personId: 'person_a',
      id: PUBLISHED_GUIDE.id,
    });
    const error = new ApiError(status, {
      code: 'FORBIDDEN',
      message: 'No access',
      requestId: 'request',
    });
    call.mockRejectedValue(error);
    await expect(getPublishedContent(TEST_EVENT.id, 'person_a')).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign event and wrong-version publications', async () => {
    call.mockResolvedValueOnce({ data: { ...PUBLISHED_GUIDE, eventId: 'other' } });
    await expect(getPublishedContent(TEST_EVENT.id, 'person_a')).rejects.toThrow(
      'event and version',
    );
    call
      .mockResolvedValueOnce({ data: PUBLISHED_GUIDE })
      .mockResolvedValueOnce({ data: { ...PUBLISHED_GUIDE, id: 'different' } });
    await expect(getPublishedContent(TEST_EVENT.id, 'person_a')).rejects.toThrow(
      'event and version',
    );
  });
  it('fails honestly without a version pointer and allows storage-disabled online reads', async () => {
    call.mockRejectedValueOnce(new NetworkError('offline'));
    await expect(getPublishedContent(TEST_EVENT.id, 'person_a')).rejects.toBeInstanceOf(
      NetworkError,
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    call.mockResolvedValue({ data: PUBLISHED_GUIDE });
    expect((await getPublishedContent(TEST_EVENT.id, 'person_a')).offline).toBe(false);
  });
  it('refuses arbitrary image paths before sending credentials', async () => {
    await expect(getContentImage('https://outside.example/photo')).rejects.toThrow('floor plan');
    expect(blob).not.toHaveBeenCalled();
  });
});
describe('content editing endpoints', () => {
  it('parses drafts, versions and every reviewed write', async () => {
    call.mockResolvedValue({ data: GUIDE_DRAFT });
    expect(await getContentDraft(TEST_EVENT.id)).toEqual(GUIDE_DRAFT);
    await saveContentDraft(TEST_EVENT.id, { body: GUIDE, expectedVersion: 2, idempotencyKey: key });
    await reviewContent(TEST_EVENT.id, { expectedVersion: 2, idempotencyKey: key });
    call.mockResolvedValue({ data: PUBLISHED_GUIDE });
    expect(
      await publishContent(TEST_EVENT.id, { expectedVersion: 2, idempotencyKey: key }),
    ).toEqual(PUBLISHED_GUIDE);
    call.mockResolvedValue({
      data: { id: 'schedule_a', runAt: '2026-11-04T00:00:00.000Z', expectedVersion: 2 },
    });
    await scheduleContent(TEST_EVENT.id, {
      expectedVersion: 2,
      idempotencyKey: key,
      runAt: '2026-11-04T00:00:00.000Z',
    });
    call.mockResolvedValue({ data: [PUBLISHED_GUIDE] });
    expect(await listContentVersions(TEST_EVENT.id)).toEqual([PUBLISHED_GUIDE]);
    expect(call.mock.calls.map(([path]) => path)).toEqual([
      `${root}/draft`,
      `${root}/draft`,
      `${root}/review`,
      `${root}/publish`,
      `${root}/schedules`,
      `${root}/versions`,
    ]);
  });
  it('rejects a foreign draft', async () => {
    call.mockResolvedValue({ data: { ...GUIDE_DRAFT, eventId: 'other' } });
    await expect(getContentDraft(TEST_EVENT.id)).rejects.toThrow('another event');
  });
  it('uploads the signed form without cookies and reports an S3 failure', async () => {
    call.mockResolvedValue({
      data: {
        key: 'content/image',
        url: 'https://storage.example/upload',
        fields: { policy: 'synthetic' },
        expiresIn: 300,
        maxBytes: 1048576,
      },
    });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    const input = {
      file: new File(['image'], 'floor.png', { type: 'image/png' }),
      body: { idempotencyKey: key, contentType: 'image/png' as const, contentLength: 5 },
    };
    expect(await uploadContentImage(TEST_EVENT.id, input)).toBe('content/image');
    expect(fetch).toHaveBeenCalledWith('https://storage.example/upload', {
      method: 'POST',
      body: expect.any(FormData),
      credentials: 'omit',
    });
    expect((fetch.mock.calls[0]![1].body as FormData).get('policy')).toBe('synthetic');
    fetch.mockResolvedValue({ ok: false });
    await expect(uploadContentImage(TEST_EVENT.id, input)).rejects.toThrow('could not be uploaded');
    vi.unstubAllGlobals();
  });
});
