/**
 * Bootstrap (spec-02, §4): єдине місце, де дозволено `try/catch` заради fail-fast і фатального логу.
 * Якщо конфіг невалідний або БД недоступна (`SELECT 1`), процес завершується з кодом 1 і порт не слухається.
 */

import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

const start = async (): Promise<void> => {
  const config = loadConfig();

  let app: ReturnType<typeof buildApp>;
  try {
    app = buildApp({ config });
  } catch (error) {
    process.stderr.write(
      `fatal: ${error instanceof Error ? error.message : 'application failed to start'}\n`,
    );
    process.exit(1);
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    app.log.fatal({ err: error }, 'failed to start application');
    process.exit(1);
  }
};

await start();
