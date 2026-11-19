/**
 * Request-scoped контекст і наскрізне логування (spec-02, AC-5; ADR-0002).
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import { getLogger, getRequestId, getUserId, runWithContext } from '../src/core/context.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

type LogEntry = Record<string, unknown> & {
  readonly msg?: string;
  readonly requestId?: string;
};

type LogCapture = {
  readonly stream: { write(message: string): void };
  readonly entries: () => LogEntry[];
};

/** Перехоплює реальні JSON-рядки pino, щоб перевіряти requestId на кожному рівні. */
const createLogCapture = (): LogCapture => {
  let buffer = '';

  return {
    stream: {
      write(message: string): void {
        buffer += message;
      },
    },
    entries: (): LogEntry[] =>
      buffer
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as LogEntry),
  };
};

describe('AsyncLocalStorage контекст', () => {
  it('поза запитом аксесори повертають undefined (fallback у логах — "-")', () => {
    assert.equal(getRequestId(), undefined);
    assert.equal(getUserId(), undefined);
  });

  it('паралельні контексти не змішуються', async () => {
    const seen: string[] = [];

    await Promise.all([
      runWithContext({ requestId: 'req-a' }, async () => {
        await delay(15);
        seen.push(`${getRequestId()}:${getUserId() ?? '-'}`);
      }),
      runWithContext({ requestId: 'req-b', userId: 42 }, async () => {
        await delay(5);
        seen.push(`${getRequestId()}:${getUserId() ?? '-'}`);
      }),
    ]);

    assert.deepEqual(seen.sort(), ['req-a:-', 'req-b:42']);
  });
});

describe('наскрізне логування запиту', () => {
  const capture = createLogCapture();
  let app: FastifyInstance;

  before(async () => {
    app = buildApp({
      logger: true,
      logStream: capture.stream,
      config: { dbDriver: 'sqlite', dbPath: ':memory:', logLevel: 'debug' },
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('HTTP-хуки, сервіс і БД пишуть переданий X-Request-Id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { 'x-request-id': 'trace-levels-1' },
      payload: { email: 'levels@example.com', displayName: 'Levels', password: 'secret123' },
    });

    assert.equal(response.statusCode, 201);

    const entries = capture.entries().filter((entry) => entry.requestId === 'trace-levels-1');
    const messages = entries.map((entry) => entry.msg);

    assert.ok(messages.includes('incoming request'), 'onRequest-хук має requestId');
    assert.ok(messages.includes('request completed'), 'onResponse-хук має requestId');
    assert.ok(messages.includes('user created'), 'сервіс має requestId');
    assert.ok(
      entries.some((entry) => entry.op === 'run' && typeof entry.changes === 'number'),
      'шар БД має requestId і кількість змін',
    );
    assert.ok(
      entries.some((entry) => entry.op === 'transaction' && entry.event === 'commit'),
      'commit транзакції має requestId',
    );
  });

  it('паралельні запити з різними X-Request-Id не змішують логи', async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/users',
        headers: { 'x-request-id': 'trace-par-a' },
        payload: { email: 'par-a@example.com', displayName: 'Par A', password: 'secret123' },
      }),
      app.inject({
        method: 'POST',
        url: '/users',
        headers: { 'x-request-id': 'trace-par-b' },
        payload: { email: 'par-b@example.com', displayName: 'Par B', password: 'secret123' },
      }),
    ]);

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 201);

    const entries = capture.entries();
    const logsA = entries.filter((entry) => entry.requestId === 'trace-par-a');
    const logsB = entries.filter((entry) => entry.requestId === 'trace-par-b');

    assert.ok(
      logsA.some((entry) => entry.msg === 'user created' && entry.email === 'par-a@example.com'),
      'сервіс запиту A бачить лише свій email',
    );
    assert.ok(
      logsB.some((entry) => entry.msg === 'user created' && entry.email === 'par-b@example.com'),
      'сервіс запиту B бачить лише свій email',
    );
    assert.ok(
      logsA.some((entry) => entry.op === 'run'),
      'запит A має логи БД',
    );
    assert.ok(
      logsB.some((entry) => entry.op === 'run'),
      'запит B має логи БД',
    );
    assert.ok(logsA.some((entry) => entry.msg === 'request completed'));
    assert.ok(logsB.some((entry) => entry.msg === 'request completed'));
    assert.ok(!logsA.some((entry) => entry.email === 'par-b@example.com'));
    assert.ok(!logsB.some((entry) => entry.email === 'par-a@example.com'));

    const foreign = entries.filter(
      (entry) =>
        entry.requestId !== 'trace-levels-1' &&
        entry.requestId !== 'trace-par-a' &&
        entry.requestId !== 'trace-par-b',
    );
    assert.deepEqual(foreign, [], 'усі логи в межах запитів мають один із requestId');
  });
});

describe('логування поза контекстом запиту', () => {
  const capture = createLogCapture();
  let app: FastifyInstance;

  before(async () => {
    app = buildApp({
      logger: true,
      logStream: capture.stream,
      config: { dbDriver: 'memory', dbPath: ':memory:', logLevel: 'debug' },
    });
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('getLogger() повертає безпечний fallback і не кидає', () => {
    assert.doesNotThrow(() => {
      getLogger().debug({ scope: 'unit' }, 'outside request debug');
      getLogger().info({ scope: 'unit' }, 'outside request info');
      getLogger().warn({ scope: 'unit' }, 'outside request warn');
      getLogger().error({ scope: 'unit' }, 'outside request error');
    });
    assert.equal(getRequestId(), undefined);
  });

  it('app.log поза запитом пише requestId "-"', () => {
    app.log.info({ scope: 'startup' }, 'startup log outside request');

    const entry = capture.entries().find((item) => item.msg === 'startup log outside request');
    assert.ok(entry !== undefined);
    assert.equal(entry.requestId, '-');
  });
});
