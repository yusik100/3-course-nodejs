/**
 * Спільні хелпери тестів (spec-02, Evidence). Файл не потрапляє в glob `*.test.ts`.
 */

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import type { DbDriver } from '../src/config/env.js';

export const DRIVERS: readonly DbDriver[] = ['memory', 'sqlite'];

/** SQLite тримаємо в пам'яті (`:memory:`), щоб кожен тест мав чисту БД і не смітив файлами. */
export const createTestApp = (driver: DbDriver): FastifyInstance =>
  buildApp({ logger: false, config: { dbDriver: driver, dbPath: ':memory:', logLevel: 'silent' } });

export type TestUser = {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
};

let userSequence = 0;

export const createUser = async (
  app: FastifyInstance,
  overrides: { readonly role?: string; readonly displayName?: string } = {},
): Promise<TestUser> => {
  userSequence += 1;
  const response = await app.inject({
    method: 'POST',
    url: '/users',
    payload: {
      email: `user${userSequence}@example.com`,
      displayName: overrides.displayName ?? `User ${userSequence}`,
      password: 'secret123',
      ...(overrides.role === undefined ? {} : { role: overrides.role }),
    },
  });

  if (response.statusCode !== 201) throw new Error(`Failed to create user: ${response.body}`);
  return response.json<TestUser>();
};

export type TestTicket = {
  readonly id: number;
  readonly status: string;
  readonly assigneeId: number | null;
};

export const createTicket = async (
  app: FastifyInstance,
  actorId: number,
  body: { readonly title?: string; readonly description?: string; readonly priority?: string },
  idempotencyKey: string,
): Promise<TestTicket> => {
  const response = await app.inject({
    method: 'POST',
    url: '/tickets',
    headers: { 'x-user-id': String(actorId), 'idempotency-key': idempotencyKey },
    payload: { title: body.title ?? 'Broken printer', ...body },
  });

  if (response.statusCode !== 201) throw new Error(`Failed to create ticket: ${response.body}`);
  return response.json<TestTicket>();
};
