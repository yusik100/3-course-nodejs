/**
 * Реєстрація БД у застосунку (spec-02, §4).
 *
 * Це функція, а не ізольований плагін, свідомо: Fastify інкапсулює декоратори й хуки плагінів, а `dbClient`
 * потрібен і роутам (через композицію), і тестам на корені. Клієнт відкриває composition root — саме там
 * відбувається fail-fast (`SELECT 1`), тому сервер не стартує без робочої БД.
 */

import type { FastifyInstance } from 'fastify';

import type { SqliteClient } from '../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Присутній лише при `DB_DRIVER=sqlite`; потрібен тестам для лічильника запитів (AC-7). */
    readonly dbClient?: SqliteClient;
  }
}

export const registerDatabase = (app: FastifyInstance, client: SqliteClient): void => {
  app.decorate('dbClient', client);
  app.addHook('onClose', (_instance, hookDone) => {
    client.close();
    hookDone();
  });
};
