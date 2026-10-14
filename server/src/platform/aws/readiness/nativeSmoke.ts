import type { CloudReadinessConfig } from '../../../config/schemas/readiness.js';
import type { CloudReadinessSnapshot } from './ports.js';

const checks = [
  { path: '/healthz', status: 200, html: false },
  { path: '/sign-in', status: 200, html: true },
  { path: '/e/smoke-check/map', status: 200, html: false },
  { path: '/map', status: 404, html: true },
  { path: '/api/v1/events', status: 401, html: false },
  { path: '/readyz', status: 404, html: false },
] as const;

async function htmlDocument(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (size < 128 * 1024) {
      const chunk = await reader.read();
      if (chunk.done) return text.includes('<html');
      size += chunk.value.byteLength;
      if (size > 128 * 1024) throw new Error('Smoke document exceeded its bound');
      text += decoder.decode(chunk.value, { stream: true });
      if (text.includes('<html')) return true;
    }
    return false;
  } finally { await reader.cancel(); }
}

export async function nativeSmoke(config: CloudReadinessConfig,
  input: { fetch: typeof fetch; now: () => number; signal: AbortSignal }): Promise<CloudReadinessSnapshot['smoke']> {
  const results = await Promise.all(checks.map(async check => {
    const response = await input.fetch(`${config.nativeOrigin}${check.path}`, {
      redirect: 'manual', signal: input.signal, headers: { 'Cache-Control': 'no-cache' },
    });
    try {
      // hardcoding-allowed: fixed deployment response header, unrelated to event data.
      if (response.headers.get('X-SPOH-Deployment') !== config.deploymentId) {
        throw new Error('Smoke response does not match the selected deployment');
      }
      return response.status === check.status && (!check.html || await htmlDocument(response));
    } finally { if (!response.bodyUsed) await response.body?.cancel(); }
  }));
  return { deploymentId: config.deploymentId, observedAtMs: input.now(), passed: results.every(Boolean) };
}
