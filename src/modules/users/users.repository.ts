/**
 * Порт доступу до `users` (spec-02, §1–§2).
 *
 * SQL і мапінг рядків живуть лише в реалізаціях цього інтерфейсу. Tickets читає користувачів через свій JOIN,
 * а для перевірки ролі отримує структурний `UsersLookup` (див. tickets.types.ts) — без імпорту внутрішніх файлів.
 */

import type { Role } from '../../core/domain.js';
import type { NewUser, User, UserPatch } from './users.types.js';

export type UserRow = {
  readonly id: number;
  readonly email: string;
  readonly password_hash: string;
  readonly display_name: string;
  readonly role: Role;
  readonly created_at: string;
  readonly updated_at: string;
};

export const mapUserRow = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export type UsersRepository = {
  readonly create: (input: NewUser) => User;
  readonly findById: (id: number) => User | undefined;
  readonly findByEmail: (email: string) => User | undefined;
  readonly list: () => User[];
  readonly update: (id: number, patch: UserPatch) => User | undefined;
};
