/**
 * Бізнес-правила Users (spec-02, §1, §7): нормалізація email, унікальність, роль за замовчуванням, 404.
 * Тут немає SQL, HTTP і `try/catch` — лише доменні рішення та кинуті `AppError`. Логер приходить із
 * request-контексту через `getLogger()`, тому сигнатура фабрики лишається чистою.
 */

import { getLogger } from '../../core/context.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import type { UsersRepository } from './users.repository.js';
import type { CreateUserCommand, UpdateUserCommand, User } from './users.types.js';

export type UsersService = {
  readonly create: (command: CreateUserCommand) => User;
  readonly getById: (id: number) => User;
  readonly list: () => User[];
  readonly update: (id: number, command: UpdateUserCommand) => User;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const createUsersService = (repository: UsersRepository): UsersService => ({
  create: (command: CreateUserCommand): User => {
    const logger = getLogger();
    const email = normalizeEmail(command.email);

    if (repository.findByEmail(email) !== undefined) {
      logger.warn({ email }, 'user creation rejected: email already taken');
      throw new ConflictError('EMAIL_TAKEN', `User with email ${email} already exists`, { email });
    }

    const user = repository.create({
      email,
      // Хешування пароля — окрема ітерація (spec-02, Non-goals), тому колонка поки зберігає введене значення.
      passwordHash: command.password,
      displayName: command.displayName.trim(),
      role: command.role ?? 'client',
    });

    logger.info({ userId: user.id, email: user.email, role: user.role }, 'user created');
    return user;
  },

  getById: (id: number): User => {
    const logger = getLogger();
    const user = repository.findById(id);
    if (user === undefined) {
      logger.warn({ userId: id }, 'user lookup failed: not found');
      throw new NotFoundError(`User ${id} not found`, { id });
    }

    logger.debug({ userId: id }, 'user loaded');
    return user;
  },

  list: (): User[] => {
    const users = repository.list();
    getLogger().debug({ count: users.length }, 'users listed');
    return users;
  },

  update: (id: number, command: UpdateUserCommand): User => {
    const logger = getLogger();

    if (repository.findById(id) === undefined) {
      logger.warn({ userId: id }, 'user update rejected: user not found');
      throw new NotFoundError(`User ${id} not found`, { id });
    }
    if (command.displayName === undefined && command.role === undefined) {
      logger.warn({ userId: id }, 'user update rejected: nothing to update');
      throw new ValidationError('Nothing to update: provide displayName and/or role');
    }

    const updated = repository.update(id, {
      ...(command.displayName === undefined ? {} : { displayName: command.displayName.trim() }),
      ...(command.role === undefined ? {} : { role: command.role }),
    });
    if (updated === undefined) {
      logger.warn({ userId: id }, 'user update failed: user disappeared during update');
      throw new NotFoundError(`User ${id} not found`, { id });
    }

    logger.info(
      {
        userId: id,
        displayNameChanged: command.displayName !== undefined,
        roleChanged: command.role !== undefined,
      },
      'user updated',
    );
    return updated;
  },
});
