import { buildApp } from './app.js';

const app = buildApp();

const start = async (): Promise<void> => {
  try {
    await app.listen({
      port: Number(process.env['PORT'] ?? 3000),
      host: process.env['HOST'] ?? '0.0.0.0',
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

await start();
