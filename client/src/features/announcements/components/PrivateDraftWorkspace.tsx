import { useState } from 'react';
import type { AnnouncementDraftRecord, MeResponse } from '@spoh/shared';
import { Button, Callout, LoadingRows, Stack } from '@/shared/ui';
import { ApiError } from '@/shared/lib/apiErrors';
import { useAnnouncementDrafts } from '../queries';
import { DraftEditor } from './DraftEditor';
import { DraftSchedules } from './DraftSchedules';

export function PrivateDraftWorkspace({ me }: { me: MeResponse }) {
  const drafts = useAnnouncementDrafts();
  const [selected, setSelected] = useState<AnnouncementDraftRecord | null>(null);
  const denied = privateDraftAccessDenied(drafts.error);
  const items = visibleDrafts(drafts);
  const current = selected ? items.find((item) => item.id === selected.id) : undefined;
  return (
    <Stack>
      <PrivateDraftToolbar
        query={drafts}
        archived={me.event.status === 'ARCHIVED'}
        onNew={() => setSelected(null)}
      />
      <PrivateDraftResults query={drafts} items={items} current={current} onSelect={setSelected} />
      {!denied ? (
        <PrivateDraftDetail reviewed={selected} current={current} me={me} onSaved={setSelected} />
      ) : null}
    </Stack>
  );
}

type DraftQuery = ReturnType<typeof useAnnouncementDrafts>;
function privateDraftAccessDenied(error: unknown) {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
function visibleDrafts(query: DraftQuery) {
  if (privateDraftAccessDenied(query.error)) return [];
  return query.data?.pages.flatMap((page) => page.data) ?? [];
}
function PrivateDraftToolbar({
  query: drafts,
  archived,
  onNew,
}: {
  query: DraftQuery;
  archived: boolean;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-sm">
      <Button variant="quiet" disabled={archived} onClick={onNew}>
        New draft
      </Button>
      <Button variant="quiet" disabled={drafts.isFetching} onClick={() => void drafts.refetch()}>
        Reload drafts
      </Button>
    </div>
  );
}
function PrivateDraftResults({
  query: drafts,
  items,
  current,
  onSelect,
}: {
  query: DraftQuery;
  items: AnnouncementDraftRecord[];
  current: AnnouncementDraftRecord | undefined;
  onSelect: (draft: AnnouncementDraftRecord) => void;
}) {
  return (
    <>
      {drafts.isError ? (
        <Callout tone="alert" role="alert">
          Could not load your drafts. Reload to try again.
        </Callout>
      ) : null}
      {drafts.isLoading ? (
        <LoadingRows count={2} label="Loading private drafts" />
      ) : (
        <PrivateDraftList items={items} current={current} onSelect={onSelect} />
      )}
      {drafts.hasNextPage ? (
        <Button
          variant="quiet"
          onClick={() => void drafts.fetchNextPage()}
          disabled={drafts.isFetchingNextPage}
        >
          Load more drafts
        </Button>
      ) : null}
    </>
  );
}
function PrivateDraftDetail({
  reviewed,
  current,
  me,
  onSaved,
}: {
  reviewed: AnnouncementDraftRecord | null;
  current: AnnouncementDraftRecord | undefined;
  me: MeResponse;
  onSaved: (draft: AnnouncementDraftRecord) => void;
}) {
  if (reviewed && !current)
    return (
      <Callout role="status">
        The selected draft is unavailable. Reload or start a new draft.
      </Callout>
    );
  const draft = reviewedDraft(current, reviewed);
  const changed = !!current && !!draft && current.version !== draft.version;
  return (
    <>
      {changed ? (
        <Callout tone="warn" role="status">
          The saved draft changed to version {current.version}. Your input still uses reviewed
          version {draft.version}.
          <Button variant="quiet" onClick={() => onSaved(current)}>
            Load current saved version
          </Button>
        </Callout>
      ) : null}
      <DraftEditor key={draftEditorKey(draft)} draft={draft} me={me} onSaved={onSaved} />
      {current ? <DraftSchedules draft={draft ?? current} me={me} /> : null}
    </>
  );
}

function PrivateDraftList({
  items,
  current,
  onSelect,
}: {
  items: AnnouncementDraftRecord[];
  current: AnnouncementDraftRecord | undefined;
  onSelect: (draft: AnnouncementDraftRecord) => void;
}) {
  if (items.length === 0) return <p className="text-caption">You have no saved private drafts.</p>;
  return (
    <ul className="flex flex-col gap-xs">
      {items.map((draft) => (
        <li key={draft.id}>
          <Button
            variant="quiet"
            aria-pressed={current?.id === draft.id}
            onClick={() => onSelect(draft)}
          >
            {draft.body.slice(0, 80)} · version {draft.version}
            {draft.publishedAt ? ' · Published' : ''}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function draftEditorKey(draft: AnnouncementDraftRecord | undefined) {
  if (!draft) return 'new';
  return `${draft.id}-${draft.version}-${draft.publishedAt ?? ''}`;
}

function reviewedDraft(
  current: AnnouncementDraftRecord | undefined,
  reviewed: AnnouncementDraftRecord | null,
) {
  if (current?.publishedAt) return current;
  return reviewed ?? undefined;
}
