import { useEffect, useState } from 'react';
import { EventName } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';

interface Draft {
  eventId: string;
  /** The name the draft was read as: what a rename expects to replace. */
  read: string;
  text: string;
}

/** Keep an edited draft of the same event; otherwise take the name as now read. */
function reseed(previous: Draft | null, next: Draft): Draft {
  const edited =
    previous !== null &&
    previous.eventId === next.eventId &&
    previous.text.trim() !== previous.read;
  return edited ? previous : next;
}

/** What the draft would rename the event to, if anything, and whether it is valid. */
function summarise(draft: Draft | null) {
  if (!draft) return { text: '', read: undefined, change: null, invalid: false };
  const parsed = EventName.safeParse(draft.text);
  const name = parsed.success ? parsed.data : null;
  return {
    text: draft.text,
    read: draft.read,
    /** The trimmed name when it is valid and differs from the name read. */
    change: name !== null && name !== draft.read ? name : null,
    invalid: name === null,
  };
}

/**
 * The name as typed, and the name it was read as. A refresh replaces an
 * untouched draft, but never an edited one: the rename then names the name its
 * author read, so the server refuses it if someone renamed the event meanwhile.
 */
export function useEventNameDraft(current: string | undefined) {
  const eventId = useEventId();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (current !== undefined)
      setDraft((previous) => reseed(previous, { eventId, read: current, text: current }));
  }, [current, eventId]);
  return {
    ...summarise(draft?.eventId === eventId ? draft : null),
    setText: (text: string) => setDraft((previous) => previous && { ...previous, text }),
    /** After a rename: the new name is what the draft was read as. */
    accept: (renamed: string) => setDraft({ eventId, read: renamed, text: renamed }),
  };
}
