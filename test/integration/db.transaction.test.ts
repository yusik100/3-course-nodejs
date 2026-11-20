/**
 * Транзакційність (spec-02, §3, §8; AC-10; spec-03, AC-3): реальний файловий SQLite.
 * Тест працює напряму з репозиторієм, щоб змоделювати збій на другому INSERT.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { SqliteClient } from '../../src/db/client.js';
import { sql } from '../../src/db/sql.js';
import { createSqliteTicketsRepository } from '../../src/modules/tickets/tickets.sqlite.repository.js';
import { createSqliteUsersRepository } from '../../src/modules/users/users.sqlite.repository.js';
import { createTempDb, type TempDb } from '../support/temp-db.js';

describe('транзакційність створення тикета (sqlite file)', () => {
  let temp: TempDb;
  let client: SqliteClient;

  const countTickets = (): number =>
    client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM tickets`)?.total ?? 0;

  const countKeys = (): number =>
    client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM idempotency_keys`)?.total ?? 0;

  before(() => {
    temp = createTempDb();
    client = temp.client;
  });

  after(() => {
    temp.cleanup();
  });

  it('збій на записі ключа ідемпотентності відкочує і тикет, і ключ', () => {
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

    assert.equal(countTickets(), 0);
    assert.equal(countKeys(), 0);
  });

  it('client.transaction відкочує зміни при помилці й лишає з’єднання робочим', () => {
    const before =
      client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM users`)?.total ?? 0;

    assert.throws(() =>
      client.transaction(() => {
        client.run(sql`
          INSERT INTO users (email, password_hash, display_name, role, created_at, updated_at)
          VALUES ('tx-rollback@example.com', 'hash', 'Rollback', 'client', 'now', 'now')
        `);
        throw new Error('transaction failed');
      }),
    );

    const after =
      client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM users`)?.total ?? 0;
    assert.equal(after, before);
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
    assert.equal(countTickets(), 1);
    assert.equal(countKeys(), 1);
  });
});
