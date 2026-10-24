/**
 * Composition root (spec-02, §2): тут і лише тут обирається драйвер БД і збирається об'єктний граф
 * (репозиторій → сервіс → модуль). Сервіси не знають, пам'ять це чи SQLite.
 */

import { randomUUID } from 'node:crypto';

import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { loadConfig, type AppConfig } from './config/env.js';
import { getRequestId } from './core/context.js';
import { openSqliteClient, type SqliteClient } from './db/client.js';
import { ticketsModule } from './modules/tickets/index.js';
import { createMemoryTicketsRepository } from './modules/tickets/tickets.memory.repository.js';
import { createSqliteTicketsRepository } from './modules/tickets/tickets.sqlite.repository.js';
import { createTicketsService } from './modules/tickets/tickets.service.js';
import { usersModule } from './modules/users/index.js';
import { createMemoryUsersRepository } from './modules/users/users.memory.repository.js';
import { createSqliteUsersRepository } from './modules/users/users.sqlite.repository.js';
import { createUsersService } from './modules/users/users.service.js';
import { registerDatabase } from './plugins/db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRequestContext } from './plugins/request-context.js';

export type BuildAppOptions = {
  readonly logger?: boolean;
  readonly config?: Partial<AppConfig>;
};

const readHeader = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
};

/**
 * Створює Fastify-інстанс без запуску сервера — щоб його можна було тестувати через `app.inject()`.
 * Якщо БД недоступна, `openSqliteClient` кидає помилку тут, до `listen` (fail-fast).
 */
export const buildApp = ({
  logger = true,
  config: overrides = {},
}: BuildAppOptions = {}): FastifyInstance => {
  const config: AppConfig = { ...loadConfig(), ...overrides };

  const fastifyLogger: FastifyServerOptions['logger'] = logger
    ? { level: config.logLevel, mixin: () => ({ requestId: getRequestId() ?? '-' }) }
    : false;

  const app = Fastify({
    logger: fastifyLogger,
    genReqId: (request) => readHeader(request.headers['x-request-id']) ?? randomUUID(),
    // Стандартні request-логи вимкнені: Fastify пише `incoming request` до `onRequest`, тому там ще немає
    // контексту ALS. Обидва рядки («incoming request», «request completed») пише `registerRequestContext`
    // усередині `als.run(...)`, щоб `requestId` був у кожному рядку запиту (AC-5).
    logController: new LogController({ disableRequestLogging: true }),
  });

  const client: SqliteClient | undefined =
    config.dbDriver === 'sqlite' ? openSqliteClient(config.dbPath) : undefined;

  const usersRepository =
    client === undefined ? createMemoryUsersRepository() : createSqliteUsersRepository(client);
  const ticketsRepository =
    client === undefined
      ? createMemoryTicketsRepository(usersRepository)
      : createSqliteTicketsRepository(client);

  const usersService = createUsersService(usersRepository);
  const ticketsService = createTicketsService({
    tickets: ticketsRepository,
    users: usersRepository,
  });

  registerRequestContext(app);
  registerErrorHandler(app);
  if (client !== undefined) registerDatabase(app, client);

  app.get('/health', () => ({
    status: 'ok',
    driver: config.dbDriver,
    uptime: process.uptime(),
  }));

  app.register(usersModule, { service: usersService });
  app.register(ticketsModule, { service: ticketsService });

  return app;
};
