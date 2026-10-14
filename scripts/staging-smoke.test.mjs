import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../infra/scripts/smoke.mjs', import.meta.url));
async function smokeFixture(overrides = {}) {
  const requests = [];
  const responses = {
    '/healthz': [200, 'healthy'],
    '/sign-in': [200, '<html>Sign in</html>'],
    '/e/smoke-check/map': [200, '<html>Event screen</html>'],
    '/map': [404, '<html>Old address</html>'],
    '/api/v1/events': [401, 'Authentication required'],
    '/api/v1/me': [503, 'No event is set up yet'],
    '/readyz': [404, 'Private'],
    ...overrides,
  };
  const server = createServer((request, response) => {
    requests.push(request.url);
    const [status, body] = responses[request.url] ?? [404, 'Unknown route'];
    response.writeHead(status, { 'Content-Type': 'text/html' });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [script, `http://127.0.0.1:${server.address().port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
    return { ...result, requests };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('cold staging proves anonymous refusal through the person API before any event exists', async () => {
  const result = await smokeFixture();
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.ok(result.requests.includes('/api/v1/events'));
  assert.ok(!result.requests.includes('/api/v1/me'));
  assert.equal(result.requests.length, 6);
});
for (const status of [200, 403, 429, 503])
  test(`anonymous ${status} is not authentication-refusal proof`, async () => {
    const result = await smokeFixture({ '/api/v1/events': [status, 'Incorrect refusal'] });
    assert.notEqual(result.code, 0);
    assert.match(result.stdout, /FAIL.*signed out/);
  });
for (const path of ['/healthz', '/sign-in', '/e/smoke-check/map', '/map', '/readyz'])
  test(`the original ${path} contract remains blocking`, async () => {
    const result = await smokeFixture({ [path]: [500, 'Broken'] });
    assert.notEqual(result.code, 0);
  });
