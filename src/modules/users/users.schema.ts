/**
 * JSON-схеми модуля Users (spec-02, §1): валідація входу і серіалізація виходу.
 * Жодної бізнес-логіки — лише контракт HTTP.
 */

import type { FastifySchema } from 'fastify';

import { ROLES } from '../../core/domain.js';

const userResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'email', 'displayName', 'role', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'integer' },
    email: { type: 'string' },
    displayName: { type: 'string' },
    role: { type: 'string', enum: [...ROLES] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const userIdParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
};

/** Без `format: email`, щоб не тягнути `ajv-formats`; пробіли навколо дозволені й зрізаються в сервісі. */
const EMAIL_PATTERN = '^\\s*[^@\\s]+@[^@\\s]+\\.[^@\\s]+\\s*$';

export const createUserSchema: FastifySchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'displayName', 'password'],
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 254, pattern: EMAIL_PATTERN },
      displayName: { type: 'string', minLength: 1, maxLength: 100 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
      role: { type: 'string', enum: [...ROLES] },
    },
  },
  response: { 201: userResponse },
};

export const listUsersSchema: FastifySchema = {
  response: { 200: { type: 'array', items: userResponse } },
};

export const getUserSchema: FastifySchema = {
  params: userIdParams,
  response: { 200: userResponse },
};

export const updateUserSchema: FastifySchema = {
  params: userIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      displayName: { type: 'string', minLength: 1, maxLength: 100 },
      role: { type: 'string', enum: [...ROLES] },
    },
  },
  response: { 200: userResponse },
};
