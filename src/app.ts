import Fastify from 'fastify';

type BuildAppOptions = {
  logger?: boolean;
};

/**
 * Створює Fastify-інстанс без запуску сервера — щоб його можна було тестувати через `app.inject()`.
 * Порт і хост читає bootstrap (`src/index.ts`).
 */
export const buildApp = ({ logger = true }: BuildAppOptions = {}) => {
  const app = Fastify({ logger });

  app.get('/health', () => ({
    status: 'ok',
    uptime: process.uptime(),
  }));

  return app;
};
