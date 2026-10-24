/**
 * SQLite-реалізація порту Users (spec-02, §1–§3; ADR-0003).
 *
 * Уся робота з SQL — тут. Записи обгорнуті `withRetry(() => client.transaction(...))`: повтор лише навколо
 * цілої транзакції, читання — без ретраїв (вони й так ідемпотентні, але зайвий раз не блокуємо event loop).
 */

import type { SqliteClient } from '../../db/client.js';
import { withRetry } from '../../db/retry.js';
import { join, sql, type Sql } from '../../db/sql.js';
import { mapUserRow, type UserRow, type UsersRepository } from './users.repository.js';
import type { NewUser, User, UserPatch } from './users.types.js';

const readById = (client: SqliteClient, id: number): User | undefined => {
  const row = client.get<UserRow>(sql`SELECT * FROM users WHERE id = ${id}`);
  return row === undefined ? undefined : mapUserRow(row);
};

export const createSqliteUsersRepository = (client: SqliteClient): UsersRepository => ({
  create: (input: NewUser): User => {
    const now = new Date().toISOString();

    return withRetry(() =>
      client.transaction(() => {
        const result = client.run(sql`
          INSERT INTO users (email, password_hash, display_name, role, created_at, updated_at)
          VALUES (${input.email}, ${input.passwordHash}, ${input.displayName}, ${input.role}, ${now}, ${now})
        `);

        const created = readById(client, result.lastInsertRowid);
        if (created === undefined) throw new Error('Inserted user could not be read back');
        return created;
      }),
    );
  },

  findById: (id: number): User | undefined => readById(client, id),

  findByEmail: (email: string): User | undefined => {
    const row = client.get<UserRow>(sql`SELECT * FROM users WHERE email = ${email}`);
    return row === undefined ? undefined : mapUserRow(row);
  },

  list: (): User[] => client.all<UserRow>(sql`SELECT * FROM users ORDER BY id`).map(mapUserRow),

  update: (id: number, patch: UserPatch): User | undefined => {
    const now = new Date().toISOString();
    const assignments: Sql[] = [];
    if (patch.displayName !== undefined) assignments.push(sql`display_name = ${patch.displayName}`);
    if (patch.role !== undefined) assignments.push(sql`role = ${patch.role}`);
    if (assignments.length === 0) return readById(client, id);
    assignments.push(sql`updated_at = ${now}`);

    return withRetry(() =>
      client.transaction(() => {
        const row = client.get<UserRow>(sql`
          UPDATE users SET ${join(assignments, ', ')} WHERE id = ${id} RETURNING *
        `);
        return row === undefined ? undefined : mapUserRow(row);
      }),
    );
  },
});
