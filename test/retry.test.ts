/**
 * Ретраї (spec-02, §9; AC-9). Тест не ходить у БД — перевіряє сам декоратор.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ServiceUnavailableError } from '../src/core/errors.js';
import { isRetryableDatabaseError, withRetry } from '../src/db/retry.js';

const busyError = (): Error => Object.assign(new Error('database is locked'), { errcode: 5 });

describe('withRetry', () => {
  it('робить рівно 3 спроби на SQLITE_BUSY і кидає 503', () => {
    let calls = 0;

    assert.throws(
      () =>
        withRetry(
          () => {
            calls += 1;
            throw busyError();
          },
          { backoffMs: 0 },
        ),
      ServiceUnavailableError,
    );

    assert.equal(calls, 3);
  });

  it('повертає результат, якщо друга спроба успішна', () => {
    let calls = 0;

    const value = withRetry(
      () => {
        calls += 1;
        if (calls < 2) throw busyError();
        return 'ok';
      },
      { backoffMs: 0 },
    );

    assert.equal(value, 'ok');
    assert.equal(calls, 2);
  });

  it('не-retryable помилка пробрасується одразу, без повторів', () => {
    const failure = new Error('SQL logic error');
    let calls = 0;

    assert.throws(
      () =>
        withRetry(() => {
          calls += 1;
          throw failure;
        }),
      (thrown: unknown) => thrown === failure,
    );

    assert.equal(calls, 1);
  });

  it('isRetryableDatabaseError розпізнає errcode і текст помилки', () => {
    assert.equal(isRetryableDatabaseError(busyError()), true);
    assert.equal(isRetryableDatabaseError(new Error('SQLITE_BUSY: another writer')), true);
    assert.equal(isRetryableDatabaseError(new Error('SQL logic error')), false);
    assert.equal(isRetryableDatabaseError('not an error'), false);
  });
});
