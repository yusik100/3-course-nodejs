/**
 * Доменні типи модуля Users (docs/er-diagram.md, spec-02 §7).
 */

import type { Role } from '../../core/domain.js';

export type User = {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type NewUser = {
  readonly email: string;
  readonly passwordHash: string;
  readonly displayName: string;
  readonly role: Role;
};

export type UserPatch = {
  readonly displayName?: string;
  readonly role?: Role;
};

/** Те, що приходить з HTTP: `password` поки зберігається без хешування (Non-goals spec-02). */
export type CreateUserCommand = {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
  readonly role?: Role;
};

export type UpdateUserCommand = {
  readonly displayName?: string;
  readonly role?: Role;
};
