const PREFIX = '@spoh/client/published-guide/';
function key(eventId: string, personId: string): string {
  return `${PREFIX}${encodeURIComponent(eventId)}/${encodeURIComponent(personId)}`;
}
/** A version id only, with no drafts, credentials or personal content persisted here. */
export function rememberContentVersion(input: {
  eventId: string;
  personId: string;
  id: string;
}): void {
  try {
    localStorage.setItem(key(input.eventId, input.personId), input.id);
  } catch {
    /* Optional offline support. */
  }
}
export function contentPointer(eventId: string, personId: string): string | null {
  try {
    return localStorage.getItem(key(eventId, personId));
  } catch {
    return null;
  }
}
