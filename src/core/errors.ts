/**
 * Помилки домену та їхні коди (spec-02, §6).
 *
 * Бізнес-код кидає лише ці класи; HTTP-статус і формат відповіді збирає один глобальний обробник
 * (`src/plugins/error-handler.ts`), тому в роутах і сервісах немає `try/catch` і магічних чисел.
 */

export type AppErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: AppErrorDetails | undefined;

  constructor(code: string, statusCode: number, message: string, details?: AppErrorDetails) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('VALIDATION_FAILED', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('UNAUTHORIZED', 401, message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('FORBIDDEN', 403, message, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('NOT_FOUND', 404, message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: AppErrorDetails) {
    super(code, 409, message, details);
    this.name = 'ConflictError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, details?: AppErrorDetails) {
    super('DB_UNAVAILABLE', 503, message, details);
    this.name = 'ServiceUnavailableError';
  }
}
