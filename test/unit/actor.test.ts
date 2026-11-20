/**
 * Розбір актора запиту (spec-02, §7; spec-03, AC-2).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ACTOR_HEADER, parseActorId, requireActorId } from '../../src/core/actor.js';
import { UnauthorizedError } from '../../src/core/errors.js';

describe('parseActorId', () => {
  it('повертає undefined для відсутнього/порожнього/невалідного значення', () => {
    assert.equal(parseActorId(undefined), undefined);
    assert.equal(parseActorId(''), undefined);
    assert.equal(parseActorId('   '), undefined);
    assert.equal(parseActorId([]), undefined);
    assert.equal(parseActorId('abc'), undefined);
    assert.equal(parseActorId('0'), undefined);
    assert.equal(parseActorId('-1'), undefined);
    assert.equal(parseActorId('1.5'), undefined);
  });

  it('бере перший елемент масиву та приймає додатне ціле', () => {
    assert.equal(parseActorId(['7']), 7);
    assert.equal(parseActorId(['7', '8']), 7);
    assert.equal(parseActorId('7'), 7);
    assert.equal(parseActorId(' 7 '), 7);
  });
});

describe('requireActorId', () => {
  it('кидає Unauthorized без валідного X-User-Id', () => {
    assert.throws(() => requireActorId({}), UnauthorizedError);
    assert.throws(() => requireActorId({ [ACTOR_HEADER]: 'abc' }), UnauthorizedError);
    assert.throws(() => requireActorId({ [ACTOR_HEADER]: [] }), UnauthorizedError);
  });

  it('повертає id для валідного заголовка', () => {
    assert.equal(requireActorId({ [ACTOR_HEADER]: '42' }), 42);
    assert.equal(ACTOR_HEADER, 'x-user-id');
  });
});
