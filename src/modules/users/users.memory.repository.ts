/**
 * In-memory реалізація порту Users (spec-02, §2): той самий контракт без SQL і транзакцій.
 * Потрібна, щоб один набір тестів доводив «спочатку статика, потім БД».
 */

import { createIdGenerator } from '../../core/ids.js';
import type { UsersRepository } from './users.repository.js';
import type { NewUser, User, UserPatch } from './users.types.js';

export const createMemoryUsersRepository = (): UsersRepository => {
  const users = new Map<number, User>();
  const nextId = createIdGenerator();

  const findById = (id: number): User | undefined => users.get(id);

  return {
    create: (input: NewUser): User => {
      const now = new Date().toISOString();
      const user: User = {
        id: nextId(),
        email: input.email,
        displayName: input.displayName,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      };
      users.set(user.id, user);
      return user;
    },

    findById,

    findByEmail: (email: string): User | undefined =>
      [...users.values()].find((user) => user.email === email),

    list: (): User[] => [...users.values()].sort((left, right) => left.id - right.id),

    update: (id: number, patch: UserPatch): User | undefined => {
      const current = findById(id);
      if (current === undefined) return undefined;

      const updated: User = {
        ...current,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
        ...(patch.role === undefined ? {} : { role: patch.role }),
        updatedAt: new Date().toISOString(),
      };
      users.set(id, updated);
      return updated;
    },
  };
};
