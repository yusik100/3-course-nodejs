/**
 * Конфігурація застосунку зі змінних середовища (spec-02, §2, §4).
 *
 * Читається один раз у composition root (`src/app.ts`) і передається далі явно — без глобального стану.
 */

export type DbDriver = 'memory' | 'sqlite';

export type AppConfig = {
  readonly dbDriver: DbDriver;
  readonly dbPath: string;
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
};

const DEFAULT_DB_PATH = './task-tracker.db';
const DEFAULT_PORT = 3000;

const parseDriver = (raw: string | undefined): DbDriver => {
  if (raw === undefined || raw === '') return 'sqlite';
  if (raw === 'memory' || raw === 'sqlite') return raw;
  throw new Error(`Invalid DB_DRIVER "${raw}": expected "memory" or "sqlite"`);
};

const parsePort = (raw: string | undefined): number => {
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}": expected an integer in 1..65535`);
  }
  return port;
};

export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => ({
  dbDriver: parseDriver(source['DB_DRIVER']),
  dbPath: source['DB_PATH'] ?? DEFAULT_DB_PATH,
  port: parsePort(source['PORT']),
  host: source['HOST'] ?? '0.0.0.0',
  logLevel: source['LOG_LEVEL'] ?? 'info',
});
