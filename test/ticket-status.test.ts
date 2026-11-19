/**
 * Статуси та виконавець (spec-01 §Статуси, spec-02 AC-3).
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

const changeStatus = (app: FastifyInstance, actorId: number, ticketId: number, status: string) =>
  app.inject({
    method: 'PATCH',
    url: `/tickets/${ticketId}/status`,
    headers: { 'x-user-id': String(actorId) },
    payload: { status },
  });

for (const driver of DRIVERS) {
  describe(`ticket status (${driver})`, () => {
    let app: FastifyInstance;
    let reporter: TestUser;
    let agent: TestUser;
    let client: TestUser;

    before(async () => {
      app = createTestApp(driver);
      await app.ready();
      reporter = await createUser(app);
      agent = await createUser(app, { role: 'agent' });
      client = await createUser(app);
    });

    after(async () => {
      await app.close();
    });

    it('дозволений шлях new → in_progress → resolved → in_progress', async () => {
      const ticket = await createTicket(app, reporter.id, { title: 'Lifecycle' }, 'status-key-1');

      const started = await changeStatus(app, agent.id, ticket.id, 'in_progress');
      assert.equal(started.statusCode, 200);
      assert.equal(started.json<TestTicket>().status, 'in_progress');

      const resolved = await changeStatus(app, agent.id, ticket.id, 'resolved');
      assert.equal(resolved.statusCode, 200);

      const reopened = await changeStatus(app, agent.id, ticket.id, 'in_progress');
      assert.equal(reopened.statusCode, 200);
      assert.equal(reopened.json<TestTicket>().status, 'in_progress');
    });

    it('невалідний перехід new → resolved → 409 INVALID_STATUS_TRANSITION', async () => {
      const ticket = await createTicket(app, reporter.id, { title: 'Jump status' }, 'status-key-2');

      const response = await changeStatus(app, agent.id, ticket.id, 'resolved');

      assert.equal(response.statusCode, 409);
      assert.equal(
        response.json<{ error: { code: string } }>().error.code,
        'INVALID_STATUS_TRANSITION',
      );
    });

    it('agent призначає agent-а виконавцем і знімає призначення', async () => {
      const ticket = await createTicket(app, reporter.id, { title: 'Assign me' }, 'status-key-3');

      const assigned = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticket.id}/assignee`,
        headers: { 'x-user-id': String(agent.id) },
        payload: { assigneeId: agent.id },
      });
      assert.equal(assigned.statusCode, 200);
      assert.equal(assigned.json<TestTicket>().assigneeId, agent.id);

      const unassigned = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticket.id}/assignee`,
        headers: { 'x-user-id': String(agent.id) },
        payload: { assigneeId: null },
      });
      assert.equal(unassigned.statusCode, 200);
      assert.equal(unassigned.json<TestTicket>().assigneeId, null);
    });

    it('клієнт не може призначати виконавця → 403 FORBIDDEN', async () => {
      const ticket = await createTicket(
        app,
        reporter.id,
        { title: 'Client assign' },
        'status-key-4',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticket.id}/assignee`,
        headers: { 'x-user-id': String(client.id) },
        payload: { assigneeId: agent.id },
      });

      assert.equal(response.statusCode, 403);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'FORBIDDEN');
    });

    it('виконавцем може бути лише agent → 409 ASSIGNEE_NOT_AGENT', async () => {
      const ticket = await createTicket(
        app,
        reporter.id,
        { title: 'Wrong assignee' },
        'status-key-5',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: `/tickets/${ticket.id}/assignee`,
        headers: { 'x-user-id': String(agent.id) },
        payload: { assigneeId: client.id },
      });

      assert.equal(response.statusCode, 409);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'ASSIGNEE_NOT_AGENT');
    });

    it('зміна статусу невідомого тикета → 404', async () => {
      const response = await changeStatus(app, agent.id, 999, 'in_progress');
      assert.equal(response.statusCode, 404);
    });
  });
}
