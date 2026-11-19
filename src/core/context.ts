/**
 * Request-scoped контекст через `AsyncLocalStorage` (spec-02, §5; ADR-0002).
 *
 * Через контекст передаються лише технічні поля (`requestId`, `userId`, `logger`) — залежності (репозиторії,
 * `db`, конфіг) ідуть явно з composition root. Поза запитом аксесори повертають `undefined`, а `getLogger()`
 * віддає безпечний no-op fallback: відсутність контексту не повинна ламати бізнес-код.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type AppLogFields = Record<string, unknown>;

/**
 * Мінімальний контракт логера для сервісів і шару БД. Свідомо не залежить від Fastify/pino: `request.log`
 * структурно сумісний із цим інтерфейсом, а core/ не знає про HTTP.
 */
export interface AppLogger {
  debug(fields: AppLogFields, message: string): void;
  info(fields: AppLogFields, message: string): void;
  warn(fields: AppLogFields, message: string): void;
  error(fields: AppLogFields, message: string): void;
}

export type RequestContext = {
  readonly requestId: string;
  readonly userId?: number;
  readonly logger?: AppLogger;
};

const noop = (): void => {};

/**
 * Fallback для викликів поза запитом (старт, seed, юніт-тести): нічого не пише й не кидає. Логи старту
 * застосунку йдуть через `app.log`, де `mixin` підставляє `requestId: '-'`.
 */
const fallbackLogger: AppLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(context: RequestContext, operation: () => T): T =>
  storage.run(context, operation);

export const getContext = (): RequestContext | undefined => storage.getStore();

export const getRequestId = (): string | undefined => storage.getStore()?.requestId;

export const getUserId = (): number | undefined => storage.getStore()?.userId;

export const getLogger = (): AppLogger => storage.getStore()?.logger ?? fallbackLogger;
