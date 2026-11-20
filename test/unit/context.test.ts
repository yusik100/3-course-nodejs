/**
 * Request-scoped контекст (spec-02, AC-5; ADR-0002) — unit-рівень, без Fastify.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getContext,
  getLogger,
  getRequestId,
  getUserId,
  runWithContext,
} from '../../src/core/context.js';
import { createFakeLogger } from '../support/fakes.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('AsyncLocalStorage контекст (unit)', () => {
  it('поза запитом аксесори повертають undefined, а getLogger() — безпечний fallback', () => {
    assert.equal(getContext(), undefined);
    assert.equal(getRequestId(), undefined);
    assert.equal(getUserId(), undefined);

    const logger = getLogger();
    assert.doesNotThrow(() => {
      logger.debug({ scope: 'unit' }, 'outside request debug');
      logger.info({ scope: 'unit' }, 'outside request info');
      logger.warn({ scope: 'unit' }, 'outside request warn');
      logger.error({ scope: 'unit' }, 'outside request error');
    });
    assert.equal(getLogger(), logger, 'fallback має бути стабільним');
  });

  it('всередині контексту повертає requestId, userId і logger', () => {
    const { logger, records } = createFakeLogger();

    const result = runWithContext({ requestId: 'req-1', userId: 7, logger }, () => {
      assert.equal(getRequestId(), 'req-1');
      assert.equal(getUserId(), 7);
      assert.equal(getContext()?.requestId, 'req-1');
      assert.equal(getLogger(), logger);

      getLogger().info({ scope: 'unit' }, 'inside request');
      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.deepEqual(records, [
      { level: 'info', fields: { scope: 'unit' }, message: 'inside request' },
    ]);
  });

  it('вкладений контекст не залишає слідів у зовнішньому', () => {
    runWithContext({ requestId: 'outer' }, () => {
      runWithContext({ requestId: 'inner' }, () => {
        assert.equal(getRequestId(), 'inner');
      });
      assert.equal(getRequestId(), 'outer');
    });
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
