import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClientConfigurationSchema } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { env } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';

const original = { ...env };
const app = createApp();
beforeEach(async () => {
  await resetDatabase();
});
afterEach(() => Object.assign(env, original));

describe('public runtime client configuration', () => {
  it('works without a session/event and returns only the explicit local metadata allowlist', async () => {
    env.APP_BASE_URL = undefined;
    env.DEPLOYMENT_ENV = 'development';
    const response = await request(app).get('/api/v1/client-config');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=300');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toEqual({
      data: {
        version: 1,
        apiBaseUrl: '',
        envLabel: 'development',
        authProvider: 'local',
        cognito: null,
      },
    });
    expect(ClientConfigurationSchema.safeParse(response.body.data).success).toBe(true);
  });

  it('uses runtime Cognito configuration and never request-selected origin/provider values', async () => {
    Object.assign(env, {
      AUTH_PROVIDER: 'cognito',
      DEPLOYMENT_ENV: 'staging',
      APP_BASE_URL: 'https://api.example.test/',
      COGNITO_DOMAIN: 'https://auth.example.test/',
      COGNITO_REGION: 'ap-southeast-1',
      COGNITO_USER_POOL_ID: 'test-pool',
      COGNITO_CLIENT_ID: 'test-client',
    });
    const response = await request(app)
      .get('/api/v1/client-config?apiBaseUrl=https://evil.example&authProvider=local')
      .set('Host', 'evil.example');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      version: 1,
      apiBaseUrl: 'https://api.example.test',
      envLabel: 'staging',
      authProvider: 'cognito',
      cognito: {
        region: 'ap-southeast-1',
        userPoolId: 'test-pool',
        clientId: 'test-client',
        domain: 'https://auth.example.test',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(
      /SECRET|PRIVATE|DATABASE|PASSWORD|LOCAL_AUTH|SESSION_SIGNING/,
    );
  });

  it('does not disclose credentials even when local mode has stale Cognito environment values', async () => {
    Object.assign(env, {
      COGNITO_CLIENT_ID: 'stale-client',
      COGNITO_DOMAIN: 'https://stale.example',
    });
    const response = await request(app).get('/api/v1/client-config');
    expect(response.status).toBe(200);
    expect(response.body.data.cognito).toBeNull();
    for (const key of ['DATABASE_URL', 'LOCAL_AUTH_SECRET', 'SESSION_SIGNING_SECRET']) {
      expect(JSON.stringify(response.body)).not.toContain(env[key as keyof typeof env]);
    }
  });

  it('rejects incomplete or unsafe cloud metadata instead of advertising local authentication', async () => {
    Object.assign(env, { AUTH_PROVIDER: 'cognito', COGNITO_USER_POOL_ID: undefined });
    const response = await request(app).get('/api/v1/client-config');
    expect(response.status).toBe(500);
    expect(response.body).not.toHaveProperty('data');
    expect(response.headers['cache-control'] ?? '').not.toContain('max-age=300');
  });

  it('supports credential-free CORS only for the configured client origin', async () => {
    const allowed = await request(app)
      .get('/api/v1/client-config')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const refused = await request(app)
      .get('/api/v1/client-config')
      .set('Origin', 'https://evil.example');
    expect(refused.headers['access-control-allow-origin']).toBeUndefined();
  });
});
