/**
 * SQLite-репозиторій Users на реальному файлі (spec-03, AC-3).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { SqliteClient } from '../../src/db/client.js';
import type { UsersRepository } from '../../src/modules/users/users.repository.js';
import { createSqliteUsersRepository } from '../../src/modules/users/users.sqlite.repository.js';
import { createTempDb, type TempDb } from '../support/temp-db.js';

describe('UsersRepository (SQLite file)', () => {
  let temp: TempDb;
  let client: SqliteClient;
  let repository: UsersRepository;

  before(() => {
    temp = createTempDb();
    client = temp.client;
    repository = createSqliteUsersRepository(client);
  });

  after(() => {
    temp.cleanup();
  });

  it('створює, знаходить за email/id, повертає список і оновлює користувача', () => {
    const user = repository.create({
      email: 'repo-user@example.com',
      passwordHash: 'hash',
      displayName: 'Repo User',
      role: 'client',
    });

    assert.equal(repository.findById(user.id)?.email, user.email);
    assert.equal(repository.findByEmail('repo-user@example.com')?.id, user.id);
    assert.deepEqual(repository.list(), [user]);

    const updated = repository.update(user.id, { displayName: 'Updated', role: 'agent' });

    assert.equal(updated?.displayName, 'Updated');
    assert.equal(updated?.role, 'agent');
    assert.equal(repository.findById(user.id)?.displayName, 'Updated');
  });

  it('повертає undefined для невідомих id/email і не оновлює невідомого', () => {
    assert.equal(repository.findById(999), undefined);
    assert.equal(repository.findByEmail('missing@example.com'), undefined);
    assert.equal(repository.update(999, { role: 'agent' }), undefined);
  });

  it('не дозволяє дубль email на рівні UNIQUE', () => {
    repository.create({
      email: 'unique@example.com',
      passwordHash: 'hash',
      displayName: 'Unique',
      role: 'client',
    });

    assert.throws(
      () =>
        repository.create({
          email: 'unique@example.com',
          passwordHash: 'hash',
          displayName: 'Duplicate',
          role: 'client',
        }),
      /UNIQUE|constraint/i,
    );
  });
});
