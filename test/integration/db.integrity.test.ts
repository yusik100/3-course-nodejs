/**
 * Цілісність SQLite-схеми (spec-02 §3; spec-03, AC-3): CHECK, FK, cascade/restrict.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { SqliteClient } from '../../src/db/client.js';
import { sql } from '../../src/db/sql.js';
import type { UsersRepository } from '../../src/modules/users/users.repository.js';
import { createSqliteUsersRepository } from '../../src/modules/users/users.sqlite.repository.js';
import { createTempDb, type TempDb } from '../support/temp-db.js';

describe('цілісність SQLite-схеми (file)', () => {
  let temp: TempDb;
  let client: SqliteClient;
  let users: UsersRepository;

  const createUser = (email: string, role: 'client' | 'agent' | 'admin' = 'client') =>
    users.create({ email, passwordHash: 'hash', displayName: email, role });

  const createTicket = (reporterId: number, title = 'Valid ticket'): number =>
    client.run(sql`
      INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
      VALUES (${title}, NULL, 'new', 'normal', ${reporterId}, NULL, 'now', 'now')
    `).lastInsertRowid;

  const countComments = (): number =>
    client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM ticket_comments`)?.total ?? 0;

  const countKeys = (): number =>
    client.get<{ total: number }>(sql`SELECT COUNT(*) AS total FROM idempotency_keys`)?.total ?? 0;

  before(() => {
    temp = createTempDb();
    client = temp.client;
    users = createSqliteUsersRepository(client);
  });

  after(() => {
    temp.cleanup();
  });

  it('увімкнений foreign_keys і CHECK для role/status/priority/title/body', () => {
    assert.equal(client.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`)?.foreign_keys, 1);

    const user = createUser('check-user@example.com');

    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO users (email, password_hash, display_name, role, created_at, updated_at)
          VALUES ('bad-role@example.com', 'hash', 'Bad', 'invalid', 'now', 'now')
        `),
      /CHECK|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
          VALUES ('Valid title', NULL, 'invalid', 'normal', ${user.id}, NULL, 'now', 'now')
        `),
      /CHECK|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
          VALUES ('Valid title', NULL, 'new', 'urgent', ${user.id}, NULL, 'now', 'now')
        `),
      /CHECK|constraint/i,
    );
    assert.throws(() => createTicket(user.id, 'ab'), /CHECK|constraint/i);

    const ticketId = createTicket(user.id);
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
          VALUES (${ticketId}, ${user.id}, '', 'now')
        `),
      /CHECK|constraint/i,
    );
  });

  it('відхиляє порушення FK для tickets/comments/idempotency_keys', () => {
    const user = createUser('fk-user@example.com');
    const ticketId = createTicket(user.id);

    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
          VALUES ('No reporter', NULL, 'new', 'normal', 999, NULL, 'now', 'now')
        `),
      /FOREIGN KEY|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
          VALUES ('No assignee', NULL, 'new', 'normal', ${user.id}, 999, 'now', 'now')
        `),
      /FOREIGN KEY|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
          VALUES (${ticketId}, 999, 'Ghost', 'now')
        `),
      /FOREIGN KEY|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
          VALUES (999, ${user.id}, 'Ghost', 'now')
        `),
      /FOREIGN KEY|constraint/i,
    );
    assert.throws(
      () =>
        client.run(sql`
          INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, status_code, response_json, created_at)
          VALUES ('ghost-key', 999, 'POST', '/tickets', 'hash', 201, '{}', 'now')
        `),
      /FOREIGN KEY|constraint/i,
    );
  });

  it('каскадно видаляє коментарі разом із тикетом, але не дає видалити автора з тикетом', () => {
    const cascadeUser = createUser('cascade@example.com');
    const ticketId = createTicket(cascadeUser.id);
    client.run(sql`
      INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
      VALUES (${ticketId}, ${cascadeUser.id}, 'Cascade me', 'now')
    `);
    assert.equal(countComments(), 1);

    client.run(sql`DELETE FROM tickets WHERE id = ${ticketId}`);
    assert.equal(countComments(), 0);

    const restrictUser = createUser('restrict@example.com');
    createTicket(restrictUser.id);
    assert.throws(
      () => client.run(sql`DELETE FROM users WHERE id = ${restrictUser.id}`),
      /FOREIGN KEY|constraint/i,
    );
  });

  it('каскадно видаляє idempotency_keys разом із користувачем без тикетів', () => {
    const keyUser = createUser('key-user@example.com');
    client.run(sql`
      INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, status_code, response_json, created_at)
      VALUES ('cascade-key', ${keyUser.id}, 'POST', '/tickets', 'hash', 201, '{}', 'now')
    `);
    assert.equal(countKeys(), 1);

    client.run(sql`DELETE FROM users WHERE id = ${keyUser.id}`);
    assert.equal(countKeys(), 0);
  });
});
