/**
 * Актор запиту — заголовок `X-User-Id` (spec-01, spec-02 §7). JWT/RBAC — окрема ітерація.
 *
 * Хелпер живе в core, бо це розбір HTTP-заголовка, а не бізнес-правило.
 */

import type { IncomingHttpHeaders } from 'node:http';

import { UnauthorizedError } from './errors.js';

export const ACTOR_HEADER = 'x-user-id';

export const parseActorId = (raw: string | string[] | undefined): number | undefined => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const requireActorId = (headers: IncomingHttpHeaders): number => {
  const actorId = parseActorId(headers[ACTOR_HEADER]);
  if (actorId === undefined) {
    throw new UnauthorizedError('Header X-User-Id with a valid user id is required');
  }
  return actorId;
};
