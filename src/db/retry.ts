/**
 * Ретраї для зайнятої БД (spec-02, §9).
 *
 * `withRetry` повторює **лише** SQLITE_BUSY / SQLITE_LOCKED і обгортає цілу транзакцію, а не окремі statement'и
 * (інакше повтор неідемпотентного INSERT створив би дубль). Синхронний: усі виклики — `DatabaseSync`, async-гілка
 * відкладена (spec-02, §9).
 */

import { ServiceUnavailableError } from '../core/errors.js';
import { attempt } from './attempt.js';

/** SQLITE_BUSY і SQLITE_LOCKED з `sqlite3.h`. */
const RETRYABLE_SQLITE_CODES = new Set([5, 6]);

export type RetryOptions = {
  readonly attempts?: number;
  readonly backoffMs?: number;
};

const readErrcode = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('errcode' in error)) return undefined;

  const value = (error as { errcode?: unknown }).errcode;
  return typeof value === 'number' ? value : undefined;
};

export const isRetryableDatabaseError = (error: unknown): boolean => {
  const errcode = readErrcode(error);
  if (errcode !== undefined && RETRYABLE_SQLITE_CODES.has(errcode)) return true;

  return (
    error instanceof Error && /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(error.message)
  );
};

/**
 * `node:sqlite` синхронний, тому пауза між спробами теж синхронна: `Atomics.wait` не дає event loop
 * виконати зайву роботу, поки БД звільняється. Пауза коротка (за замовчуванням 25 мс).
 */
const sleepSync = (ms: number): void => {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

export const withRetry = <T>(operation: () => T, options: RetryOptions = {}): T => {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? 25;
  let lastError: unknown;

  for (let attemptNumber = 1; attemptNumber <= attempts; attemptNumber += 1) {
    const result = attempt(operation);
    if (result.ok) return result.value;

    lastError = result.error;
    if (!isRetryableDatabaseError(result.error)) throw result.error;

    if (attemptNumber < attempts) sleepSync(backoffMs * 2 ** (attemptNumber - 1));
  }

  throw new ServiceUnavailableError('Database is busy after retries, try again later', {
    attempts,
    cause: lastError instanceof Error ? lastError.message : 'unknown error',
  });
};
