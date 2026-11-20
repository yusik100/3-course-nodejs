/**
 * Ручні фейки для unit-тестів (spec-03, §2): без mock-фреймворків.
 */

import type { AppLogger, AppLogFields } from '../../src/core/context.js';
import type { TicketsRepository } from '../../src/modules/tickets/tickets.repository.js';
import type { DirectoryUser, UsersDirectory } from '../../src/modules/tickets/tickets.types.js';

export const createFakeUsersDirectory = (users: readonly DirectoryUser[] = []): UsersDirectory => ({
  findById: (id: number): DirectoryUser | undefined => users.find((user) => user.id === id),
});

const unexpected = (method: string): never => {
  throw new Error(`Unexpected repository call: ${method}`);
};

/** Порожній репозиторій: кожен тест перевизначає лише потрібні методи. */
export const createFakeTicketsRepository = (
  overrides: Partial<TicketsRepository> = {},
): TicketsRepository => ({
  create: () => unexpected('create'),
  findById: () => undefined,
  findWithAuthors: () => undefined,
  listWithAuthors: () => [],
  countComments: () => new Map<number, number>(),
  listComments: () => [],
  updateStatus: () => undefined,
  updateAssignee: () => undefined,
  addComment: () => unexpected('addComment'),
  createTicketIdempotent: () => unexpected('createTicketIdempotent'),
  ...overrides,
});

export type LogRecord = {
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly fields: AppLogFields;
  readonly message: string;
};

/** Логер-стаб для unit-тестів контексту/логів. */
export const createFakeLogger = (): { logger: AppLogger; records: LogRecord[] } => {
  const records: LogRecord[] = [];
  const write =
    (level: LogRecord['level']) =>
    (fields: AppLogFields, message: string): void => {
      records.push({ level, fields, message });
    };

  return {
    logger: {
      debug: write('debug'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
    },
    records,
  };
};
