/**
 * Тимчасові файлові БД для integration/e2e (spec-03, §3–§4).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openSqliteClient, type SqliteClient } from '../../src/db/client.js';

export type TempDbPath = {
  readonly dir: string;
  readonly path: string;
  readonly cleanup: () => void;
};

export type TempDb = TempDbPath & {
  readonly client: SqliteClient;
};

const removeDir = (dir: string): void => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
};

/** Шлях для e2e: БД відкриває сам застосунок через `buildApp`. */
export const createTempDbPath = (): TempDbPath => {
  const dir = mkdtempSync(join(tmpdir(), 'task-tracker-it-'));
  return { dir, path: join(dir, 'test.db'), cleanup: () => removeDir(dir) };
};

/** Відкритий клієнт для integration-тестів репозиторіїв і `src/db/**`. */
export const createTempDb = (): TempDb => {
  const temp = createTempDbPath();

  let client: SqliteClient;
  try {
    client = openSqliteClient(temp.path);
  } catch (error) {
    temp.cleanup();
    throw error;
  }

  return {
    ...temp,
    client,
    cleanup: () => {
      client.close();
      temp.cleanup();
    },
  };
};
