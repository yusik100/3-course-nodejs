/**
 * Коментарі (spec-02, §7; AC-1, AC-7).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { createTestApp, createTicket, createUser, DRIVERS, type TestUser } from './helpers.js';

type CommentBody = {
  readonly id: number;
  readonly ticketId: number;
  readonly body: string;
  readonly author: { readonly id: number; readonly displayName: string };
};

for (const driver of DRIVERS) {
  describe(`comments (${driver})`, () => {
    let app: FastifyInstance;
    let author: TestUser;
    let ticketId: number;

    before(async () => {
      app = createTestApp(driver);
      await app.ready();
      author = await createUser(app);
      const ticket = await createTicket(
        app,
        author.id,
        { title: 'Needs comments' },
        'comments-key-1',
      );
      ticketId = ticket.id;
    });

    after(async () => {
      await app.close();
    });

    it('POST /tickets/:id/comments створює коментар із автором', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { 'x-user-id': String(author.id) },
        payload: { body: '  Looking into it  ' },
      });

      assert.equal(response.statusCode, 201);
      const comment = response.json<CommentBody>();
      assert.equal(comment.body, 'Looking into it');
      assert.equal(comment.ticketId, ticketId);
      assert.equal(comment.author.id, author.id);
      assert.equal(comment.author.displayName, author.displayName);
    });

    it('GET /tickets/:id/comments повертає коментарі за порядком створення', async () => {
      await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { 'x-user-id': String(author.id) },
        payload: { body: 'Second comment' },
      });

      const response = await app.inject({ method: 'GET', url: `/tickets/${ticketId}/comments` });

      assert.equal(response.statusCode, 200);
      const comments = response.json<CommentBody[]>();
      assert.equal(comments.length, 2);
      assert.equal(comments[0]?.body, 'Looking into it');
      assert.equal(comments[1]?.body, 'Second comment');
    });

    it('GET /tickets/:id показує коментарі в деталях і лічильник у списку', async () => {
      const details = await app.inject({ method: 'GET', url: `/tickets/${ticketId}` });
      assert.equal(details.json<{ comments: CommentBody[] }>().comments.length, 2);

      const list = await app.inject({ method: 'GET', url: '/tickets' });
      const item = list
        .json<Array<{ id: number; commentsCount: number }>>()
        .find((ticket) => ticket.id === ticketId);
      assert.equal(item?.commentsCount, 2);
    });

    it('порожній коментар (лише пробіли) → 400 VALIDATION_FAILED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/tickets/${ticketId}/comments`,
        headers: { 'x-user-id': String(author.id) },
        payload: { body: '   ' },
      });

      assert.equal(response.statusCode, 400);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'VALIDATION_FAILED');
    });

    it('коментар до невідомого тикета → 404 NOT_FOUND', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/tickets/999/comments',
        headers: { 'x-user-id': String(author.id) },
        payload: { body: 'Ghost' },
      });

      assert.equal(response.statusCode, 404);
    });
  });
}
