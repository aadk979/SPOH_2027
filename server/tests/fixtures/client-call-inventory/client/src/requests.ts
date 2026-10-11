declare function eventApi(
  eventId: string,
  path: string,
  options?: { method?: string; signal?: AbortSignal },
): Promise<unknown>;

export function conditionalReads(eventId: string, signal?: AbortSignal) {
  eventApi(eventId, '/optional-signal', signal ? { signal } : undefined);
  eventApi(eventId, '/mixed-methods', signal ? { method: 'POST' } : undefined);
  const options = signal ? { method: 'DELETE' } : undefined;
  eventApi(eventId, '/bound-options', options);
}

export function uncertainMethods(eventId: string, method: string, options: { method?: string }) {
  eventApi(eventId, '/unknown-method', { method });
  eventApi(eventId, '/unknown-options', options);
  eventApi(eventId, '/known-or-unknown', method ? { method } : undefined);
}

export function spreadOptions(eventId: string, options: { method?: string }) {
  eventApi(eventId, '/unknown-spread', { ...options });
  eventApi(eventId, '/explicit-after-spread', { ...options, method: 'POST' });
  eventApi(eventId, '/unknown-after-method', { method: 'DELETE', ...options });
  eventApi(eventId, '/known-spread', { ...{ method: 'PATCH' } });
  eventApi(eventId, '/known-read-spread', { ...{ signal: undefined } });
}
