/**
 * Транзакції для `node:sqlite` (spec-02, §3).
 *
 * `BEGIN IMMEDIATE` бере write-lock одразу, тому конкурентний запит падає на SQLITE_BUSY швидко й
 * передбачувано — це і є сигнал для `withRetry`. Транзакцію відкриває лише репозиторій.
 */

import type { DatabaseSync } from 'node:sqlite';

import { attempt } from './attempt.js';

/** Необов'язкові спостерігачі, щоб шар БД міг логувати commit/rollback без `try/catch` тут. */
export type TransactionHooks = {
  readonly onCommit?: () => void;
  readonly onRollback?: (error: unknown) => void;
};

export const withTransaction = <T>(
  db: DatabaseSync,
  operation: () => T,
  hooks: TransactionHooks = {},
): T => {
  db.exec('BEGIN IMMEDIATE');

  const result = attempt(operation);
  if (result.ok) {
    db.exec('COMMIT');
    hooks.onCommit?.();
    return result.value;
  }

  db.exec('ROLLBACK');
  hooks.onRollback?.(result.error);
  throw result.error;
};
