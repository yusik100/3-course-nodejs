/**
 * Єдиний глобальний обробник помилок (spec-02, §6).
 *
 * Реєструється на корені застосунку, тому успадковується всіма плагінами-модулями. Формат відповіді —
 * `{ error: { code, message, details? }, requestId }`; стектрейс назовні не виходить. 4xx логуються як `warn`,
 * 5xx — як `error`.
 */

import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';

import { getRequestId } from '../core/context.js';
import { AppError } from '../core/errors.js';

type ErrorPayload = {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
  readonly requestId: string;
};

const requestIdOf = (request: FastifyRequest): string => getRequestId() ?? request.id;

const payload = (
  code: string,
  message: string,
  details: unknown,
  requestId: string,
): ErrorPayload =>
  details === undefined
    ? { error: { code, message }, requestId }
    : { error: { code, message, details }, requestId };

const isValidationError = (error: FastifyError): boolean =>
  error.validation !== undefined || error.code === 'FST_ERR_VALIDATION';

const isConstraintError = (error: FastifyError): boolean =>
  /SQLITE_CONSTRAINT|constraint failed/i.test(error.message);

export const registerErrorHandler = (app: FastifyInstance): void => {
  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ method: request.method, url: request.url }, 'route not found');
    void reply
      .code(404)
      .send(
        payload(
          'NOT_FOUND',
          `Route ${request.method} ${request.url} not found`,
          undefined,
          requestIdOf(request),
        ),
      );
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const requestId = requestIdOf(request);

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, code: error.code }, 'request failed');
      } else {
        request.log.warn({ err: error, code: error.code }, 'request failed');
      }
      void reply
        .code(error.statusCode)
        .send(payload(error.code, error.message, error.details, requestId));
      return;
    }

    if (isValidationError(error)) {
      request.log.warn({ err: error }, 'request validation failed');
      void reply
        .code(400)
        .send(
          payload('VALIDATION_FAILED', 'Request validation failed', error.validation, requestId),
        );
      return;
    }

    if (isConstraintError(error)) {
      request.log.warn({ err: error }, 'database constraint violation');
      void reply
        .code(409)
        .send(
          payload(
            'CONFLICT',
            'Request conflicts with the current state of the resource',
            undefined,
            requestId,
          ),
        );
      return;
    }

    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      request.log.warn({ err: error }, 'request rejected');
      void reply
        .code(error.statusCode)
        .send(payload(error.code, error.message, undefined, requestId));
      return;
    }

    request.log.error({ err: error }, 'unhandled request error');
    void reply
      .code(500)
      .send(payload('INTERNAL_ERROR', 'Internal server error', undefined, requestId));
  });
};
