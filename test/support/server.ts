/**
 * Реальний HTTP-сервер для e2e (spec-03, §4): `port: 0` + фактичний порт із `server.address()`.
 */

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';

export type TestServer = {
  readonly app: FastifyInstance;
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
};

export const startTestServer = async (dbPath: string): Promise<TestServer> => {
  const app = buildApp({
    logger: false,
    config: { dbDriver: 'sqlite', dbPath, logLevel: 'silent' },
  });

  await app.listen({ port: 0, host: '127.0.0.1' });

  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    await app.close();
    throw new Error('Test server did not expose a TCP address');
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async (): Promise<void> => {
      await app.close();
    },
  };
};
