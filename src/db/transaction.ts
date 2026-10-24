/**
 * Транзакції для `node:sqlite` (spec-02, §3).
 *
 * `BEGIN IMMEDIATE` бере write-lock одразу, тому конкурентний запит падає на SQLITE_BUSY швидко й
 * передбачувано — це і є сигнал для `withRetry`. Транзакцію відкриває лише репозиторій.
 */

import type { DatabaseSync } from 'node:sqlite';

import { attempt } from './attempt.js';

export const withTransaction = <T>(db: DatabaseSync, operation: () => T): T => {
  db.exec('BEGIN IMMEDIATE');

  const result = attempt(operation);
  if (result.ok) {
    db.exec('COMMIT');
    return result.value;
  }

  db.exec('ROLLBACK');
  throw result.error;
};
