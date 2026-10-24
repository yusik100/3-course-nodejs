/**
 * Request-scoped контекст через `AsyncLocalStorage` (spec-02, §5; ADR-0002).
 *
 * Через контекст передаються лише технічні поля (`requestId`, `userId`) — залежності (репозиторії, `db`,
 * конфіг) ідуть явно з composition root. Поза запитом аксесори повертають `undefined`, помилка не кидається.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  readonly requestId: string;
  readonly userId?: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(context: RequestContext, operation: () => T): T =>
  storage.run(context, operation);

export const getContext = (): RequestContext | undefined => storage.getStore();

export const getRequestId = (): string | undefined => storage.getStore()?.requestId;

export const getUserId = (): number | undefined => storage.getStore()?.userId;
