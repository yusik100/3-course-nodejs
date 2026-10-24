/**
 * Request-контекст (spec-02, §5; ADR-0002).
 *
 * `onRequest` — єдина точка входу: беремо `X-Request-Id` (або згенерований Fastify id), кладемо контекст
 * в `AsyncLocalStorage`, повертаємо id клієнту тим самим заголовком. Далі id доступний у будь-якому шарі
 * через `getRequestId()` — без передачі параметрами.
 *
 * Реєструється функцією на корені, бо хук має діяти для всіх дочірніх плагінів-модулів.
 */

import type { FastifyInstance } from 'fastify';

import { parseActorId } from '../core/actor.js';
import { runWithContext, type RequestContext } from '../core/context.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export const registerRequestContext = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request, reply, done) => {
    const userId = parseActorId(request.headers['x-user-id']);
    const context: RequestContext =
      userId === undefined ? { requestId: request.id } : { requestId: request.id, userId };

    reply.header(REQUEST_ID_HEADER, request.id);
    runWithContext(context, () => {
      request.log.info({ method: request.method, url: request.url }, 'incoming request');
      done();
    });
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      { statusCode: reply.statusCode, responseTime: reply.elapsedTime },
      'request completed',
    );
    done();
  });
};
