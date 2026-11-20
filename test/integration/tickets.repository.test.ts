/**
 * SQLite-репозиторій Tickets на реальному файлі (spec-03, AC-3).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { SqliteClient } from '../../src/db/client.js';
import type { TicketsRepository } from '../../src/modules/tickets/tickets.repository.js';
import { createSqliteTicketsRepository } from '../../src/modules/tickets/tickets.sqlite.repository.js';
import type { NewTicket } from '../../src/modules/tickets/tickets.types.js';
import type { UsersRepository } from '../../src/modules/users/users.repository.js';
import { createSqliteUsersRepository } from '../../src/modules/users/users.sqlite.repository.js';
import { createTempDb, type TempDb } from '../support/temp-db.js';

describe('TicketsRepository (SQLite file)', () => {
  let temp: TempDb;
  let client: SqliteClient;
  let users: UsersRepository;
  let tickets: TicketsRepository;
  let reporter: { readonly id: number };
  let agent: { readonly id: number };

  const createTicket = (overrides: Partial<NewTicket> = {}) =>
    tickets.create({
      title: 'Repository ticket',
      description: null,
      priority: 'normal',
      reporterId: reporter.id,
      ...overrides,
    });

  before(() => {
    temp = createTempDb();
    client = temp.client;
    users = createSqliteUsersRepository(client);
    tickets = createSqliteTicketsRepository(client);
    reporter = users.create({
      email: 'repo-reporter@example.com',
      passwordHash: 'hash',
      displayName: 'Reporter',
      role: 'client',
    });
    agent = users.create({
      email: 'repo-agent@example.com',
      passwordHash: 'hash',
      displayName: 'Agent',
      role: 'agent',
    });
  });

  after(() => {
    temp.cleanup();
  });

  it('створює тикет і повертає його з авторами', () => {
    const ticket = createTicket();
    const withAuthors = tickets.findWithAuthors(ticket.id);

    assert.equal(tickets.findById(ticket.id)?.title, ticket.title);
    assert.equal(withAuthors?.reporter.id, reporter.id);
    assert.equal(withAuthors?.reporter.displayName, 'Reporter');
    assert.equal(withAuthors?.assignee, null);
  });

  it('фільтрує список за status і assigneeId', () => {
    const inProgress = createTicket({ title: 'In progress ticket' });
    const assigned = createTicket({ title: 'Assigned ticket' });
    tickets.updateStatus(inProgress.id, 'in_progress');
    tickets.updateAssignee(assigned.id, agent.id);

    const byStatus = tickets.listWithAuthors({ status: 'in_progress' });
    assert.ok(byStatus.some((ticket) => ticket.id === inProgress.id));
    assert.ok(byStatus.every((ticket) => ticket.status === 'in_progress'));

    const byAssignee = tickets.listWithAuthors({ assigneeId: agent.id });
    assert.ok(byAssignee.some((ticket) => ticket.id === assigned.id));
    assert.ok(byAssignee.every((ticket) => ticket.assigneeId === agent.id));
  });

  it('рахує коментарі одним запитом і не робить запит для порожнього списку', () => {
    const first = createTicket({ title: 'Comments one' });
    const second = createTicket({ title: 'Comments two' });
    tickets.addComment({ ticketId: first.id, authorId: reporter.id, body: 'First' });
    tickets.addComment({ ticketId: second.id, authorId: reporter.id, body: 'Second' });

    const emptyBefore = client.queryCount();
    assert.deepEqual([...tickets.countComments([])], []);
    assert.equal(client.queryCount() - emptyBefore, 0);

    const before = client.queryCount();
    const counts = tickets.countComments([first.id, second.id]);
    assert.equal(client.queryCount() - before, 1);
    assert.equal(counts.get(first.id), 1);
    assert.equal(counts.get(second.id), 1);
  });

  it('повертає коментарі в порядку створення', () => {
    const ticket = createTicket({ title: 'Ordered comments' });
    tickets.addComment({ ticketId: ticket.id, authorId: reporter.id, body: 'First' });
    tickets.addComment({ ticketId: ticket.id, authorId: agent.id, body: 'Second' });

    const comments = tickets.listComments(ticket.id);

    assert.deepEqual(
      comments.map((comment) => comment.body),
      ['First', 'Second'],
    );
    assert.equal(comments[0]?.author.displayName, 'Reporter');
    assert.equal(comments[1]?.author.displayName, 'Agent');
  });

  it('оновлює статус/виконавця і повертає undefined для невідомих id', () => {
    const ticket = createTicket({ title: 'Update me' });

    assert.equal(tickets.updateStatus(ticket.id, 'in_progress')?.status, 'in_progress');
    assert.equal(tickets.updateAssignee(ticket.id, agent.id)?.assigneeId, agent.id);
    assert.equal(tickets.updateStatus(999, 'in_progress'), undefined);
    assert.equal(tickets.updateAssignee(999, null), undefined);
  });

  it('створює коментар із автором', () => {
    const ticket = createTicket({ title: 'Comment me' });
    const comment = tickets.addComment({
      ticketId: ticket.id,
      authorId: agent.id,
      body: 'From repository',
    });

    assert.equal(comment.ticketId, ticket.id);
    assert.equal(comment.author.id, agent.id);
    assert.equal(comment.author.displayName, 'Agent');
  });

  it('підтримує created/replayed/key-reused для ідемпотентності', () => {
    const input = {
      key: 'repo-idempotency-1',
      userId: reporter.id,
      requestHash: 'repo-hash-1',
      ticket: {
        title: 'Idempotent repository ticket',
        description: null,
        priority: 'normal',
        reporterId: reporter.id,
      },
    } as const;

    const created = tickets.createTicketIdempotent(input);
    const replayed = tickets.createTicketIdempotent(input);
    const reused = tickets.createTicketIdempotent({ ...input, requestHash: 'repo-hash-2' });

    assert.ok(created.kind === 'created');
    assert.ok(replayed.kind === 'replayed');
    assert.equal(created.ticket.id, replayed.ticket.id);
    assert.ok(reused.kind === 'key-reused');
  });

  it('список і деталі виконують по 2 запити (N+1 відсутній)', () => {
    const ticket = createTicket({ title: 'N+1 ticket' });
    tickets.addComment({ ticketId: ticket.id, authorId: reporter.id, body: 'N+1 comment' });

    const listBefore = client.queryCount();
    const items = tickets.listWithAuthors({});
    tickets.countComments(items.map((item) => item.id));
    assert.equal(client.queryCount() - listBefore, 2);

    const detailsBefore = client.queryCount();
    tickets.findWithAuthors(ticket.id);
    tickets.listComments(ticket.id);
    assert.equal(client.queryCount() - detailsBefore, 2);
  });
});
