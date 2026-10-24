/**
 * Users: створення/читання/оновлення на обох драйверах (spec-02, AC-1, AC-3).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { createTestApp, DRIVERS, type TestUser } from './helpers.js';

for (const driver of DRIVERS) {
  describe(`users (${driver})`, () => {
    let app: FastifyInstance;

    before(async () => {
      app = createTestApp(driver);
      await app.ready();
    });

    after(async () => {
      await app.close();
    });

    it('POST /users нормалізує email і ставить роль client за замовчуванням', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { email: '  Ann@Example.COM ', displayName: '  Ann  ', password: 'secret123' },
      });

      assert.equal(response.statusCode, 201);
      const user = response.json<TestUser>();
      assert.equal(user.email, 'ann@example.com');
      assert.equal(user.displayName, 'Ann');
      assert.equal(user.role, 'client');
      assert.ok(user.id > 0);
    });

    it('дубль email (у різному регістрі) → 409 EMAIL_TAKEN', async () => {
      await app.inject({
        method: 'POST',
        url: '/users',
        payload: { email: 'dup@example.com', displayName: 'Dup', password: 'secret123' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { email: 'DUP@example.com', displayName: 'Dup 2', password: 'secret123' },
      });

      assert.equal(response.statusCode, 409);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'EMAIL_TAKEN');
    });

    it('GET /users/:id для невідомого id → 404 NOT_FOUND', async () => {
      const response = await app.inject({ method: 'GET', url: '/users/999' });

      assert.equal(response.statusCode, 404);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'NOT_FOUND');
    });

    it('PATCH /users/:id змінює роль і повертає оновлений обʼєкт', async () => {
      const created = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { email: 'agent@example.com', displayName: 'Agent', password: 'secret123' },
      });
      const user = created.json<TestUser>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/users/${user.id}`,
        payload: { role: 'agent' },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json<TestUser>().role, 'agent');
    });

    it('невалідне тіло → 400 VALIDATION_FAILED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/users',
        payload: { email: 'not-an-email', displayName: 'X', password: 'short' },
      });

      assert.equal(response.statusCode, 400);
      const body = response.json<{ error: { code: string }; requestId: string }>();
      assert.equal(body.error.code, 'VALIDATION_FAILED');
      assert.ok(body.requestId.length > 0);
    });

    it('GET /users повертає створених користувачів', async () => {
      const response = await app.inject({ method: 'GET', url: '/users' });

      assert.equal(response.statusCode, 200);
      const users = response.json<TestUser[]>();
      assert.ok(Array.isArray(users));
      assert.ok(users.length >= 3);
      assert.ok(users.every((user) => user.email === user.email.toLowerCase()));
    });
  });
}
