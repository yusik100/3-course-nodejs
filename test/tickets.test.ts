/**
 * Tickets: список/деталі з авторами, фільтри, N+1 (spec-02, AC-1, AC-7).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import {
  createTestApp,
  createTicket,
  createUser,
  DRIVERS,
  type TestTicket,
  type TestUser,
} from './helpers.js';

type TicketListItem = {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly reporter: { readonly id: number; readonly displayName: string };
  readonly assignee: { readonly id: number; readonly displayName: string } | null;
  readonly commentsCount: number;
};

type TicketDetails = TicketListItem & {
  readonly comments: readonly { readonly id: number; readonly body: string }[];
};

for (const driver of DRIVERS) {
  describe(`tickets (${driver})`, () => {
    let app: FastifyInstance;
    let reporter: TestUser;

    before(async () => {
      app = createTestApp(driver);
      await app.ready();
      reporter = await createUser(app);
      await createTicket(app, reporter.id, { title: 'Broken printer' }, 'tickets-key-1');
      await createTicket(
        app,
        reporter.id,
        { title: 'VPN is down', priority: 'high' },
        'tickets-key-2',
      );
    });

    after(async () => {
      await app.close();
    });

    it('GET /tickets повертає тикети з авторами та лічильником коментарів', async () => {
      const response = await app.inject({ method: 'GET', url: '/tickets' });

      assert.equal(response.statusCode, 200);
      const tickets = response.json<TicketListItem[]>();
      assert.equal(tickets.length, 2);
      assert.equal(tickets[0]?.reporter.id, reporter.id);
      assert.equal(tickets[0]?.reporter.displayName, reporter.displayName);
      assert.equal(tickets[0]?.assignee, null);
      assert.equal(tickets[0]?.commentsCount, 0);
      assert.equal(tickets[0]?.status, 'new');
    });

    it(
      'GET /tickets виконує рівно 2 SQL-запити незалежно від кількості тикетів (AC-7)',
      { skip: driver === 'sqlite' ? false : 'SQL-лічильник існує лише для sqlite' },
      async () => {
        const client = app.dbClient;
        assert.ok(client, 'dbClient має бути присутній при DB_DRIVER=sqlite');

        const before = client.queryCount();
        const response = await app.inject({ method: 'GET', url: '/tickets' });

        assert.equal(response.statusCode, 200);
        assert.equal(client.queryCount() - before, 2);
      },
    );

    it('GET /tickets/:id повертає деталі з порожнім списком коментарів', async () => {
      const created = await createTicket(
        app,
        reporter.id,
        { title: 'Details ticket' },
        'tickets-key-3',
      );

      const response = await app.inject({ method: 'GET', url: `/tickets/${created.id}` });

      assert.equal(response.statusCode, 200);
      const ticket = response.json<TicketDetails>();
      assert.equal(ticket.id, created.id);
      assert.deepEqual(ticket.comments, []);
      assert.equal(ticket.reporter.id, reporter.id);
    });

    it('GET /tickets/:id для невідомого id → 404 NOT_FOUND', async () => {
      const response = await app.inject({ method: 'GET', url: '/tickets/999' });

      assert.equal(response.statusCode, 404);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'NOT_FOUND');
    });

    it('POST /tickets без X-User-Id → 401 UNAUTHORIZED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { 'idempotency-key': 'no-actor-key' },
        payload: { title: 'No actor' },
      });

      assert.equal(response.statusCode, 401);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'UNAUTHORIZED');
    });

    it('POST /tickets із невідомим актором → 401 UNAUTHORIZED', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/tickets',
        headers: { 'x-user-id': '999', 'idempotency-key': 'unknown-actor-key' },
        payload: { title: 'Unknown actor' },
      });

      assert.equal(response.statusCode, 401);
    });

    it('GET /tickets?status=in_progress фільтрує за статусом', async () => {
      const created: TestTicket = await createTicket(
        app,
        reporter.id,
        { title: 'To be started' },
        'tickets-key-4',
      );

      await app.inject({
        method: 'PATCH',
        url: `/tickets/${created.id}/status`,
        headers: { 'x-user-id': String(reporter.id) },
        payload: { status: 'in_progress' },
      });

      const response = await app.inject({ method: 'GET', url: '/tickets?status=in_progress' });

      assert.equal(response.statusCode, 200);
      const tickets = response.json<TicketListItem[]>();
      assert.equal(tickets.length, 1);
      assert.equal(tickets[0]?.id, created.id);
    });
  });
}
