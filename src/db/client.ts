/**
 * Клієнт SQLite: відкриття, PRAGMA, схема, health-check і виконання запитів (spec-02, §3–§4).
 *
 * Це єдина точка входу в `node:sqlite`. Репозиторії бачать лише `SqliteClient` (all/get/run/transaction),
 * тому `prepare` і сирі statement'и не розповзаються по модулях. `queryCount` існує для доказу відсутності N+1.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { getLogger } from '../core/context.js';
import type { Sql } from './sql.js';
import { withTransaction } from './transaction.js';

export type SqliteClient = {
  readonly all: <T>(query: Sql) => T[];
  readonly get: <T>(query: Sql) => T | undefined;
  readonly run: (query: Sql) => { readonly changes: number; readonly lastInsertRowid: number };
  readonly exec: (sqlText: string) => void;
  readonly transaction: <T>(operation: () => T) => T;
  readonly queryCount: () => number;
  readonly close: () => void;
};

/** Те, що приймає `StatementSync`: без boolean та ArrayBuffer (у Node 24.13 їх ще не додано). */
type SqlInput = null | number | bigint | string | Uint8Array;

const SCHEMA_URL = new URL('./schema.sql', import.meta.url);

const toNumber = (value: number | bigint): number =>
  typeof value === 'bigint' ? Number(value) : value;

/** SQL у логах нормалізований (без переносів), значення параметрів не логуються — лише `?`-плейсхолдери. */
const describe = (query: Sql): string => query.sql.replace(/\s+/g, ' ').trim();

export const openSqliteClient = (path: string): SqliteClient => {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 });

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(readFileSync(SCHEMA_URL, 'utf8'));

  const probe = db.prepare('SELECT 1 AS ok').get() as { ok?: number | bigint } | undefined;
  if (probe?.ok === undefined || toNumber(probe.ok) !== 1) {
    db.close();
    throw new Error('Database health check failed: SELECT 1 did not return 1');
  }

  let queries = 0;
  const bind = (query: Sql): SqlInput[] => query.values as SqlInput[];

  return {
    all: <T>(query: Sql): T[] => {
      queries += 1;
      const rows = db.prepare(query.sql).all(...bind(query)) as unknown as T[];
      getLogger().debug({ op: 'all', rows: rows.length, sql: describe(query) }, 'db rows read');
      return rows;
    },
    get: <T>(query: Sql): T | undefined => {
      queries += 1;
      const row = db.prepare(query.sql).get(...bind(query)) as unknown as T | undefined;
      getLogger().debug(
        { op: 'get', found: row !== undefined, sql: describe(query) },
        'db row read',
      );
      return row;
    },
    run: (query: Sql) => {
      queries += 1;
      const result = db.prepare(query.sql).run(...bind(query));
      const row = {
        changes: toNumber(result.changes),
        lastInsertRowid: toNumber(result.lastInsertRowid),
      };
      getLogger().info(
        {
          op: 'run',
          changes: row.changes,
          lastInsertRowid: row.lastInsertRowid,
          sql: describe(query),
        },
        'db statement executed',
      );
      return row;
    },
    exec: (sqlText: string): void => {
      db.exec(sqlText);
    },
    transaction: <T>(operation: () => T): T => {
      const logger = getLogger();
      logger.debug({ op: 'transaction', event: 'begin' }, 'db transaction started');

      return withTransaction(db, operation, {
        onCommit: () =>
          logger.info({ op: 'transaction', event: 'commit' }, 'db transaction committed'),
        onRollback: (error) =>
          logger.warn(
            { op: 'transaction', event: 'rollback', err: error },
            'db transaction rolled back',
          ),
      });
    },
    queryCount: (): number => queries,
    close: (): void => {
      db.close();
    },
  };
};
