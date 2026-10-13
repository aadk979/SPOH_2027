/** Diagnostic errors may contain SQL, credentials or provider response bodies. */
export function safeError(_value: unknown): { category: string } {
  return { category: 'operation-failed' };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Only server-defined route templates are diagnostic paths; raw URLs may carry secrets even without queries. */
export function safeRequest(value: unknown): Record<string, unknown> {
  const request = record(value);
  const route = record(request.route);
  const path = typeof route.path === 'string' ? route.path : '[unmatched]';
  return { id: request.id, method: request.method, path };
}

/** Location and cookies include OAuth and one-use handoff credentials. */
export function safeResponse(value: unknown): Record<string, unknown> {
  return { statusCode: record(value).statusCode };
}

export const safeHttpSerializers = { req: safeRequest, res: safeResponse, err: safeError };
