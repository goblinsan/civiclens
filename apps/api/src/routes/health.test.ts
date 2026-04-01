import { describe, it, expect } from 'vitest';
import { buildApp } from '../app';

describe('GET /health', () => {
  it('returns 200 with service metadata', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; service: string }>();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('civiclens-api');
  });

  it('GET /ready returns 200', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string }>();
    expect(body.status).toBe('ready');
  });
});
