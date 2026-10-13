/** A platform-only session has real organisation standing and no invented event. */
export type SessionScope = { readonly eventId: string } | { readonly organisationId: string };
