/**
 * Глобальний обробник помилок і request-id (spec-02, AC-4, AC-5).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { ServiceUnavailableError } from '../../src/core/errors.js';
import { sql } from '../../src/db/sql.js';
import { createTestApp } from '../support/helpers.js';

type ErrorResponse = {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
  readonly requestId: string;
};

describe('глобальний обробник помилок', () => {
  let app: FastifyInstance;

  before(async () => {
    app = createTestApp('memory');
    app.get('/__boom', () => {
      throw new Error('boom');
    });
    app.get('/__unavailable', () => {
      throw new ServiceUnavailableError('db busy');
    });
    app.get('/__teapot', () => {
      throw Object.assign(new Error('teapot'), { statusCode: 418, code: 'TEAPOT' });
    });
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
    assert.equal(response.body.includes('at '), false);
    assert.equal(response.body.includes('stack'), false);
  });

  it('необроблена помилка → 500 INTERNAL_ERROR без деталей', async () => {
    const response = await app.inject({ method: 'GET', url: '/__boom' });

    assert.equal(response.statusCode, 500);
    const body = response.json<ErrorResponse>();
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.deepEqual(Object.keys(body).sort(), ['error', 'requestId']);
    assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
    assert.equal(response.body.includes('boom'), false);
    assert.equal(response.body.includes('at '), false);
  });

  it('ServiceUnavailableError → 503 DB_UNAVAILABLE', async () => {
    const response = await app.inject({ method: 'GET', url: '/__unavailable' });

    assert.equal(response.statusCode, 503);
    assert.equal(response.json<ErrorResponse>().error.code, 'DB_UNAVAILABLE');
  });

  it('невідомий Fastify-статус 4xx зберігається', async () => {
    const response = await app.inject({ method: 'GET', url: '/__teapot' });

    assert.equal(response.statusCode, 418);
    assert.equal(response.json<ErrorResponse>().error.code, 'TEAPOT');
  });

  it('/health повідомляє активний драйвер', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    assert.equal(response.json<{ driver: string }>().driver, 'memory');
  });
});

describe('глобальний обробник помилок (sqlite constraint)', () => {
  let app: FastifyInstance;

  before(async () => {
    app = createTestApp('sqlite');
    app.get('/__constraint', () => {
      const client = app.dbClient;
      if (client === undefined) throw new Error('dbClient missing');

      const insert = sql`
        INSERT INTO users (email, password_hash, display_name, role, created_at, updated_at)
        VALUES ('constraint@example.com', 'hash', 'Constraint', 'client', 'now', 'now')
      `;
      client.run(insert);
      client.run(insert);
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('SQLITE_CONSTRAINT → 409 CONFLICT', async () => {
    const response = await app.inject({ method: 'GET', url: '/__constraint' });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json<ErrorResponse>().error.code, 'CONFLICT');
  });
});
