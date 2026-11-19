/**
 * Глобальний обробник помилок і request-id (spec-02, AC-4, AC-5).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { createTestApp } from './helpers.js';

type ErrorResponse = {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
  readonly requestId: string;
};

describe('глобальний обробник помилок', () => {
  let app: FastifyInstance;

  before(async () => {
    app = createTestApp('memory');
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('невідомий маршрут → 404 у єдиному форматі', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });

    assert.equal(response.statusCode, 404);
    const body = response.json<ErrorResponse>();
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.requestId.length > 0);
  });

  it('повертає X-Request-Id і той самий id у тілі помилки', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/users/999',
      headers: { 'x-request-id': 'trace-123' },
    });

    assert.equal(response.headers['x-request-id'], 'trace-123');
    assert.equal(response.json<ErrorResponse>().requestId, 'trace-123');
  });

  it('генерує X-Request-Id, якщо клієнт його не передав', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.statusCode, 200);
    const header = response.headers['x-request-id'];
    assert.equal(typeof header, 'string');
    assert.ok(String(header).length > 0);
  });

  it('не віддає стектрейс назовні', async () => {
    const response = await app.inject({ method: 'GET', url: '/users/abc' });

    assert.equal(response.statusCode, 400);
    const body = response.json<ErrorResponse>();
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.equal(response.body.includes('node_modules'), false);
    assert.equal(response.body.includes('ERR_'), false);
  });

  it('/health повідомляє активний драйвер', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.json<{ driver: string }>().driver, 'memory');
  });
});
