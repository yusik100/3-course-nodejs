/**
 * Справжній e2e (spec-03, AC-4): реальний HTTP-сервер на port 0, `fetch()`, файловий SQLite.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createTempDbPath, type TempDbPath } from '../support/temp-db.js';
import { startTestServer, type TestServer } from '../support/server.js';

type User = {
  readonly id: number;
  readonly email: string;
  readonly role: string;
};

type Ticket = {
  readonly id: number;
  readonly title: string;
  readonly status: string;
  readonly reporterId: number;
  readonly assigneeId: number | null;
};

type Comment = {
  readonly id: number;
  readonly body: string;
  readonly author: { readonly id: number };
};

type ApiResult<T> = {
  readonly status: number;
  readonly headers: Headers;
  readonly body: T;
};

type CallOptions = {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
};

const call = async <T>(
  baseUrl: string,
  path: string,
  options: CallOptions = {},
): Promise<ApiResult<T>> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  const text = await response.text();
  const body = (text === '' ? undefined : JSON.parse(text)) as T;

  return { status: response.status, headers: response.headers, body };
};

describe('E2E API (real HTTP + file SQLite)', () => {
  let temp: TempDbPath;
  let server: TestServer | undefined;

  before(async () => {
    temp = createTempDbPath();
    server = await startTestServer(temp.path);
  });

  after(async () => {
    if (server !== undefined) await server.close();
    temp?.cleanup();
  });

  it('проходить повний сценарій і зберігає дані після restart', async () => {
    if (server === undefined) throw new Error('Test server was not started');
    const baseUrl = server.baseUrl;

    const health = await call<{ status: string; driver: string }>(baseUrl, '/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.driver, 'sqlite');

    const clientUser = await call<User>(baseUrl, '/users', {
      method: 'POST',
      body: { email: 'e2e-client@example.com', displayName: 'E2E Client', password: 'secret123' },
    });
    assert.equal(clientUser.status, 201);
    assert.equal(clientUser.body.role, 'client');

    const agentUser = await call<User>(baseUrl, '/users', {
      method: 'POST',
      body: {
        email: 'e2e-agent@example.com',
        displayName: 'E2E Agent',
        password: 'secret123',
        role: 'agent',
      },
    });
    assert.equal(agentUser.status, 201);
    assert.equal(agentUser.body.role, 'agent');

    const ticket = await call<Ticket>(baseUrl, '/tickets', {
      method: 'POST',
      headers: {
        'x-user-id': String(clientUser.body.id),
        'idempotency-key': 'e2e-key-1',
        'x-request-id': 'e2e-trace-1',
      },
      body: { title: 'E2E broken printer', description: 'Printer is offline' },
    });
    assert.equal(ticket.status, 201);
    assert.equal(ticket.headers.get('x-request-id'), 'e2e-trace-1');
    assert.equal(ticket.headers.get('idempotency-replayed'), null);

    const replay = await call<Ticket>(baseUrl, '/tickets', {
      method: 'POST',
      headers: {
        'x-user-id': String(clientUser.body.id),
        'idempotency-key': 'e2e-key-1',
      },
      body: { title: 'E2E broken printer', description: 'Printer is offline' },
    });
    assert.equal(replay.status, 201);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    assert.equal(replay.body.id, ticket.body.id);

    const list = await call<Ticket[]>(baseUrl, '/tickets');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0]?.id, ticket.body.id);

    const started = await call<Ticket>(baseUrl, `/tickets/${ticket.body.id}/status`, {
      method: 'PATCH',
      headers: { 'x-user-id': String(agentUser.body.id) },
      body: { status: 'in_progress' },
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'in_progress');

    const assigned = await call<Ticket>(baseUrl, `/tickets/${ticket.body.id}/assignee`, {
      method: 'PATCH',
      headers: { 'x-user-id': String(agentUser.body.id) },
      body: { assigneeId: agentUser.body.id },
    });
    assert.equal(assigned.status, 200);
    assert.equal(assigned.body.assigneeId, agentUser.body.id);

    const comment = await call<Comment>(baseUrl, `/tickets/${ticket.body.id}/comments`, {
      method: 'POST',
      headers: { 'x-user-id': String(clientUser.body.id) },
      body: { body: '  E2E comment  ' },
    });
    assert.equal(comment.status, 201);
    assert.equal(comment.body.body, 'E2E comment');
    assert.equal(comment.body.author.id, clientUser.body.id);

    const details = await call<Ticket & { comments: readonly Comment[] }>(
      baseUrl,
      `/tickets/${ticket.body.id}`,
    );
    assert.equal(details.status, 200);
    assert.equal(details.body.comments.length, 1);
    assert.equal(details.body.reporterId, clientUser.body.id);
    assert.equal(details.body.assigneeId, agentUser.body.id);

    const secondTicket = await call<Ticket>(baseUrl, '/tickets', {
      method: 'POST',
      headers: {
        'x-user-id': String(clientUser.body.id),
        'idempotency-key': 'e2e-key-2',
      },
      body: { title: 'Invalid transition ticket' },
    });
    assert.equal(secondTicket.status, 201);

    const invalidTransition = await call<{ error: { code: string } }>(
      baseUrl,
      `/tickets/${secondTicket.body.id}/status`,
      {
        method: 'PATCH',
        headers: { 'x-user-id': String(agentUser.body.id) },
        body: { status: 'resolved' },
      },
    );
    assert.equal(invalidTransition.status, 409);
    assert.equal(invalidTransition.body.error.code, 'INVALID_STATUS_TRANSITION');

    await server.close();
    server = await startTestServer(temp.path);

    const persisted = await call<Ticket & { comments: readonly Comment[] }>(
      server.baseUrl,
      `/tickets/${ticket.body.id}`,
    );
    assert.equal(persisted.status, 200);
    assert.equal(persisted.body.title, 'E2E broken printer');
    assert.equal(persisted.body.status, 'in_progress');
    assert.equal(persisted.body.comments.length, 1);

    const persistedUsers = await call<User[]>(server.baseUrl, '/users');
    assert.equal(persistedUsers.status, 200);
    assert.ok(persistedUsers.body.some((user) => user.email === 'e2e-client@example.com'));
    assert.ok(persistedUsers.body.some((user) => user.email === 'e2e-agent@example.com'));
  });
});
