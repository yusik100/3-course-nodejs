/**
 * Транзакційність (spec-02, §3, §8; AC-10): тикет і ключ ідемпотентності пишуться атомарно.
 * Тест працює напряму з репозиторієм, щоб змоделювати збій на другому INSERT.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { openSqliteClient, type SqliteClient } from '../src/db/client.js';
import { createSqliteTicketsRepository } from '../src/modules/tickets/tickets.sqlite.repository.js';
import { createSqliteUsersRepository } from '../src/modules/users/users.sqlite.repository.js';

describe('транзакційність створення тикета (sqlite)', () => {
  let client: SqliteClient;

  before(() => {
    client = openSqliteClient(':memory:');
  });

  after(() => {
    client.close();
  });

  it('збій на записі ключа ідемпотентності відкочує створений тикет', () => {
    const users = createSqliteUsersRepository(client);
    const tickets = createSqliteTicketsRepository(client);

    const reporter = users.create({
      email: 'reporter@example.com',
      passwordHash: 'secret123',
      displayName: 'Reporter',
      role: 'client',
    });

    assert.throws(() =>
      tickets.createTicketIdempotent({
        key: 'rollback-key',
        // Неіснуючий користувач → порушення FK на `idempotency_keys` уже після INSERT тикета.
        userId: 999,
        requestHash: 'hash',
        ticket: {
          title: 'Rollback me',
          description: null,
          priority: 'normal',
          reporterId: reporter.id,
        },
      }),
    );

    assert.equal(tickets.listWithAuthors({}).length, 0);
  });

  it('успішний сценарій зберігає і тикет, і ключ; повтор повертає той самий тикет', () => {
    const users = createSqliteUsersRepository(client);
    const tickets = createSqliteTicketsRepository(client);

    const reporter = users.create({
      email: 'reporter2@example.com',
      passwordHash: 'secret123',
      displayName: 'Reporter 2',
      role: 'client',
    });

    const input = {
      key: 'commit-key',
      userId: reporter.id,
      requestHash: 'hash-1',
      ticket: { title: 'Committed', description: null, priority: 'low', reporterId: reporter.id },
    } as const;

    const first = tickets.createTicketIdempotent(input);
    const second = tickets.createTicketIdempotent(input);

    assert.equal(first.kind, 'created');
    assert.equal(second.kind, 'replayed');
    assert.equal(tickets.listWithAuthors({}).length, 1);
  });
});
