import { once } from 'node:events';
import { createServer, request, Agent } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { applyHttpTimeouts, KEEP_ALIVE_TIMEOUT_MS } from '../../src/app/httpTimeouts.js';

describe('applyHttpTimeouts', () => {
  it('keeps idle sockets open far beyond Node’s 5-second default', () => {
    const server = applyHttpTimeouts(createServer());
    expect(server.keepAliveTimeout).toBe(KEEP_ALIVE_TIMEOUT_MS);
    expect(server.keepAliveTimeout).toBeGreaterThanOrEqual(60_000);
    // Under Node's request timeout, so a slow request still ends first.
    expect(server.keepAliveTimeout).toBeLessThan(server.requestTimeout);
  });

  it('advertises the longer keep-alive and still closes idle sockets on shutdown', async () => {
    const server = applyHttpTimeouts(createServer((_req, res) => res.end('ok')));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    const agent = new Agent({ keepAlive: true });
    const response = await new Promise<{ headers: Record<string, unknown> }>((resolve, reject) => {
      request({ host: '127.0.0.1', port, agent }, (res) => {
        res.resume();
        res.on('end', () => resolve({ headers: res.headers }));
      })
        .on('error', reject)
        .end();
    });
    expect(response.headers['keep-alive']).toBe(`timeout=${KEEP_ALIVE_TIMEOUT_MS / 1000}`);
    const started = Date.now();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    expect(Date.now() - started).toBeLessThan(2_000);
    agent.destroy();
  });
});
