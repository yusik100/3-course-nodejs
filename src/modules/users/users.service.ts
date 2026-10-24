/**
 * Бізнес-правила Users (spec-02, §1, §7): нормалізація email, унікальність, роль за замовчуванням, 404.
 * Тут немає SQL, HTTP і `try/catch` — лише доменні рішення та кинуті `AppError`.
 */

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
    const email = normalizeEmail(command.email);
    if (repository.findByEmail(email) !== undefined) {
      throw new ConflictError('EMAIL_TAKEN', `User with email ${email} already exists`, { email });
    }

    return repository.create({
      email,
      // Хешування пароля — окрема ітерація (spec-02, Non-goals), тому колонка поки зберігає введене значення.
      passwordHash: command.password,
      displayName: command.displayName.trim(),
      role: command.role ?? 'client',
    });
  },

  getById: (id: number): User => {
    const user = repository.findById(id);
    if (user === undefined) throw new NotFoundError(`User ${id} not found`, { id });
    return user;
  },

  list: (): User[] => repository.list(),

  update: (id: number, command: UpdateUserCommand): User => {
    if (repository.findById(id) === undefined) {
      throw new NotFoundError(`User ${id} not found`, { id });
    }
    if (command.displayName === undefined && command.role === undefined) {
      throw new ValidationError('Nothing to update: provide displayName and/or role');
    }

    const updated = repository.update(id, {
      ...(command.displayName === undefined ? {} : { displayName: command.displayName.trim() }),
      ...(command.role === undefined ? {} : { role: command.role }),
    });
    if (updated === undefined) throw new NotFoundError(`User ${id} not found`, { id });
    return updated;
  },
});
