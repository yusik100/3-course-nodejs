/**
 * Request-scoped контекст (spec-02, AC-5; ADR-0002).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getRequestId, getUserId, runWithContext } from '../src/core/context.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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
