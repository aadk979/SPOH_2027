import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/shared/lib/api';
import { ContentEditor } from '@/features/content/components/ContentEditor';
import { ContentPublishPanel } from '@/features/content/components/ContentPublishPanel';
import { FloorPlanUpload } from '@/features/content/components/FloorPlanUpload';
import { ContentVersions } from '@/features/content/components/ContentVersions';
import { PublishedGuideState } from '@/features/content/components/PublishedGuideState';
import { GUIDE, GUIDE_DRAFT, PUBLISHED_GUIDE } from '../helpers/content';
import { TEST_EVENT } from '../helpers/event';
const session = vi.hoisted(() => ({ allows: true, person: 'person_a' }));
vi.mock('@/features/session', () => ({
  useAllows: () => () => session.allows,
  useCurrentSession: () => ({ volunteerId: session.person, role: 'ADMIN' }),
  useEventTime: () => ({ dateTime: (value: string) => value }),
}));
vi.mock('@/features/stations', () => ({
  useStations: () => ({
    data: [{ id: 'station_a', name: 'Welcome desk', tags: [{ id: 'tag_a', label: 'Computing' }] }],
  }),
}));
vi.mock('@/shared/lib/api', async (original) => ({
  ...(await original<typeof import('@/shared/lib/api')>()),
  api: vi.fn(),
}));
const call = vi.mocked(api);
const clients: QueryClient[] = [];
function show(child: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{child}</QueryClientProvider>);
  return client;
}
beforeEach(() => {
  call.mockReset();
  session.allows = true;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});
describe('guide editor', () => {
  it('validates fields and saves a reviewed snapshot with a stable retry key', async () => {
    call
      .mockRejectedValueOnce(new Error('Connection failed'))
      .mockResolvedValue({ data: GUIDE_DRAFT });
    show(<ContentEditor draft={GUIDE_DRAFT} />);
    fireEvent.change(screen.getByLabelText('When you do not know'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(call).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('When you do not know'), {
      target: { value: 'Call your IC.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Connection failed/);
    const first = call.mock.calls[0]![1]?.body;
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1]![1]?.body).toEqual(first);
    expect(first).toMatchObject({
      expectedVersion: 2,
      idempotencyKey: expect.any(String),
      body: { brief: { escalationScript: 'Call your IC.' } },
    });
  });
  it('adds, edits and removes programme questions, journey steps and map locations', async () => {
    call.mockResolvedValue({ data: GUIDE_DRAFT });
    show(<ContentEditor draft={GUIDE_DRAFT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add programme' }));
    fireEvent.change(screen.getByLabelText('Programme 1: station tag'), {
      target: { value: 'tag_a' },
    });
    fireEvent.change(screen.getByLabelText('Programme in one sentence'), {
      target: { value: 'Build useful tools.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add question' }));
    fireEvent.change(screen.getByLabelText('Question 1'), {
      target: { value: 'What will I learn?' },
    });
    fireEvent.change(screen.getByLabelText('Answer 1'), { target: { value: 'Programming.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add journey step' }));
    fireEvent.change(screen.getByLabelText('Step 2: title'), { target: { value: 'Explore' } });
    fireEvent.change(screen.getByLabelText('Step 2: explanation'), {
      target: { value: 'Visit a station.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add location' }));
    fireEvent.change(screen.getByLabelText('Location 2'), { target: { value: 'Welcome desk' } });
    fireEvent.change(screen.getByLabelText('Location 2: type'), { target: { value: 'station' } });
    fireEvent.change(screen.getByLabelText(/^Location 2: station/), {
      target: { value: 'station_a' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview guide' }));
    expect(screen.getByText('Build useful tools.', { selector: 'p' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(call.mock.calls[0]![1]?.body).toMatchObject({
      body: {
        brief: {
          programmes: [
            {
              stationTagId: 'tag_a',
              faqs: [{ question: 'What will I learn?', answer: 'Programming.' }],
            },
          ],
        },
        journey: { steps: [{ title: 'Arrive' }, { title: 'Explore' }] },
        map: {
          levels: [{ points: [{ kind: 'safety' }, { stationId: 'station_a', kind: 'station' }] }],
        },
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove question 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove programme 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove location 2' }));
    expect(screen.queryByLabelText('Programme in one sentence')).toBeNull();
  });
  it('rejects oversized or executable floor plans before requesting upload credentials', () => {
    show(<FloorPlanUpload floor={GUIDE.map.levels[0]!} index={0} errors={{}} onChange={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Level one: floor plan/), {
      target: { files: [new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })] },
    });
    expect(screen.getByRole('alert').textContent).toContain('Choose a PNG');
    expect(call).not.toHaveBeenCalled();
  });
  it('keeps every map control locked during an upload and preserves other section edits', async () => {
    let finishUpload!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finishUpload = resolve; }));
    vi.stubGlobal('fetch', fetch);
    call.mockImplementation(async (path) => path.endsWith('/images/upload') ? {
      data: { key: 'content/image', url: 'https://storage.example/upload', fields: {}, expiresIn: 300, maxBytes: 1048576 },
    } : { data: GUIDE_DRAFT });
    const map = { ...GUIDE.map, levels: [...GUIDE.map.levels, { label: 'Level two', points: [] }] };
    show(<ContentEditor draft={{ ...GUIDE_DRAFT, body: { ...GUIDE, map } }} />);
    fireEvent.change(screen.getByLabelText('Map introduction'), { target: { value: 'Keep both floors.' } });
    fireEvent.change(screen.getByLabelText(/^Level one: floor plan/), {
      target: { files: [new File(['image'], 'floor.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const fields = screen.getByRole('group', { name: 'Floor map fields' }) as HTMLFieldSetElement;
    expect(fields.disabled).toBe(true);
    for (const control of fields.querySelectorAll('input,textarea,select,button')) {
      expect(control).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText('When you do not know'), { target: { value: 'Ask the event lead.' } });
    await act(async () => finishUpload(new Response(null, { status: 204 })));
    await screen.findByText('Floor plan uploaded.');
    expect(fields.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Floor plan description'), { target: { value: 'Exits on level one.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(call.mock.calls[1]![1]?.body).toMatchObject({ body: {
      brief: { escalationScript: 'Ask the event lead.' },
      map: { intro: 'Keep both floors.', levels: [
        { label: 'Level one', image: { mediaKey: 'content/image', alt: 'Exits on level one.' } },
        { label: 'Level two' },
      ] },
    } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove level 2' }));
    expect(screen.queryByLabelText('Level 2: name')).toBeNull();
  });
  it('unlocks map editing after an upload fails without inventing an image', async () => {
    let failUpload!: (error: Error) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((_resolve, reject) => { failUpload = reject; })));
    call.mockResolvedValue({ data: {
      key: 'content/image', url: 'https://storage.example/upload', fields: {}, expiresIn: 300, maxBytes: 1048576,
    } });
    show(<ContentEditor draft={GUIDE_DRAFT} />);
    fireEvent.change(screen.getByLabelText(/^Level one: floor plan/), {
      target: { files: [new File(['image'], 'floor.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(failUpload).toBeDefined());
    const fields = screen.getByRole('group', { name: 'Floor map fields' }) as HTMLFieldSetElement;
    expect(fields.disabled).toBe(true);
    await act(async () => failUpload(new Error('Upload connection failed')));
    await screen.findByText('Upload connection failed');
    expect(fields.disabled).toBe(false);
    expect(screen.queryByText('Floor plan uploaded.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    expect(screen.getByLabelText('Level 2: name')).toBeTruthy();
  });
});
describe('publication review', () => {
  it('requires review, then a separate confirmation to publish', async () => {
    call.mockResolvedValue({ data: { ...GUIDE_DRAFT, reviewedVersion: 2 } });
    const client = show(<ContentPublishPanel draft={GUIDE_DRAFT} />);
    expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reviewed draft 2' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        `/events/${TEST_EVENT.id}/content/review`,
        expect.objectContaining({
          body: { expectedVersion: 2, idempotencyKey: expect.any(String) },
        }),
      ),
    );
    cleanup();
    client.clear();
    call.mockReset();
    call.mockResolvedValue({ data: PUBLISHED_GUIDE });
    show(<ContentPublishPanel draft={{ ...GUIDE_DRAFT, reviewedVersion: 2 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publish reviewed draft' }));
    expect(call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    await screen.findByText('Guide published.');
  });
  it('schedules only the reviewed version and shows history previews', async () => {
    call.mockResolvedValue({
      data: { id: 'schedule_a', expectedVersion: 2, runAt: '2026-11-04T00:00:00.000Z' },
    });
    show(<ContentPublishPanel draft={{ ...GUIDE_DRAFT, reviewedVersion: 2 }} />);
    fireEvent.change(screen.getByLabelText('Publish later'), {
      target: { value: '2026-11-04T08:00:00+08:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule publication' }));
    await screen.findByText(/Scheduled for/);
    expect(call.mock.calls[0]![1]?.body).toMatchObject({
      expectedVersion: 2,
      runAt: '2026-11-04T08:00:00+08:00',
    });
    cleanup();
    call.mockResolvedValue({ data: [PUBLISHED_GUIDE] });
    show(<ContentVersions />);
    fireEvent.click(await screen.findByRole('button', { name: /Version 1/ }));
    expect(screen.getByText('Ask your IC for help.')).toBeTruthy();
  });
  it('does not offer publishing without permission and shows honest guide failure/retry', async () => {
    session.allows = false;
    show(<ContentPublishPanel draft={GUIDE_DRAFT} />);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    call
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValue({ data: PUBLISHED_GUIDE });
    show(<PublishedGuideState>{(record) => <p>{record.body.map.intro}</p>}</PublishedGuideState>);
    await screen.findByText(/published guide is unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Find the nearest exit.');
  });
});
