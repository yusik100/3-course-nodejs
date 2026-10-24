/**
 * Ідемпотентність створення тикетів (spec-02, §8; AC-8).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { createTestApp, createUser, DRIVERS, type TestTicket, type TestUser } from './helpers.js';

for (const driver of DRIVERS) {
  describe(`ticket idempotency (${driver})`, () => {
    let app: FastifyInstance;
    let reporter: TestUser;

    const postTicket = (body: Record<string, unknown>, key?: string, actorId?: number) =>
      app.inject({
        method: 'POST',
        url: '/tickets',
        headers: {
          'x-user-id': String(actorId ?? reporter.id),
          ...(key === undefined ? {} : { 'idempotency-key': key }),
        },
        payload: body,
      });

    before(async () => {
      app = createTestApp(driver);
      await app.ready();
      reporter = await createUser(app);
    });

    after(async () => {
      await app.close();
    });

    it('повтор із тим самим ключем і тілом повертає той самий тикет і 201', async () => {
      const body = { title: 'Idempotent ticket', description: 'Same body' };

      const first = await postTicket(body, 'idem-key-1');
      const second = await postTicket(body, 'idem-key-1');

      assert.equal(first.statusCode, 201);
      assert.equal(second.statusCode, 201);
      assert.equal(first.headers['idempotency-replayed'], undefined);
      assert.equal(second.headers['idempotency-replayed'], 'true');
      assert.equal(second.json<TestTicket>().id, first.json<TestTicket>().id);

      const list = await app.inject({ method: 'GET', url: '/tickets' });
      assert.equal(list.json<TestTicket[]>().length, 1);
    });

    it('той самий ключ з іншим тілом → 409 IDEMPOTENCY_KEY_REUSED', async () => {
      await postTicket({ title: 'Original body' }, 'idem-key-2');
      const response = await postTicket({ title: 'Different body' }, 'idem-key-2');

      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<{ error: { code: string } }>().error.code,
        'IDEMPOTENCY_KEY_REUSED',
      );
    });

    it('без Idempotency-Key → 400 VALIDATION_FAILED', async () => {
      const response = await postTicket({ title: 'No key at all' });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'VALIDATION_FAILED');
    });

    it('ключ унікальний у скоупі користувача: інший автор — інший тикет', async () => {
      const another = await createUser(app);

      const first = await postTicket({ title: 'Shared key one' }, 'idem-key-3', reporter.id);
      const second = await postTicket({ title: 'Shared key two' }, 'idem-key-3', another.id);

      assert.equal(first.statusCode, 201);
      assert.equal(second.statusCode, 201);
      assert.notEqual(first.json<TestTicket>().id, second.json<TestTicket>().id);
    });
  });
}
