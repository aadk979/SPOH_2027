import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { deploymentIdentity } from '../../src/platform/http/deploymentIdentity.js';

const config = vi.hoisted(() => ({ selection: undefined as { deploymentId: string } | undefined }));
vi.mock('../../src/config/env.js', () => ({ env: {
  get READINESS_CLOUD_CONFIG() { return config.selection; },
} }));
const app = express(); app.use(deploymentIdentity);
app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));
app.get('/refused', (_request, response) => response.status(401).json({ error: 'refused' }));
it('takes immutable identity from task configuration, ignoring a forged incoming deployment header', async () => {
  config.selection = { deploymentId: 'a'.repeat(40) };
  for (const path of ['/healthz', '/refused', '/unknown']) {
    const response = await request(app).get(path).set('X-SPOH-Deployment', 'forged-client-value');
    expect(response.headers['x-spoh-deployment']).toBe(config.selection.deploymentId);
  }
});
it('leaves an unconfigured local process identity absent rather than claiming a release', async () => {
  config.selection = undefined;
  expect((await request(app).get('/healthz')).headers['x-spoh-deployment']).toBeUndefined();
});
