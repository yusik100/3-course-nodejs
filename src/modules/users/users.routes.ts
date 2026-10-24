/**
 * HTTP-шар модуля Users (spec-02, §1): схема → сервіс → статус-код. SQL і бізнес-правил тут немає.
 */

import type { FastifyPluginCallback } from 'fastify';

import {
  createUserSchema,
  getUserSchema,
  listUsersSchema,
  updateUserSchema,
} from './users.schema.js';
import type { UsersService } from './users.service.js';
import type { CreateUserCommand, UpdateUserCommand } from './users.types.js';

export type UsersRoutesOptions = {
  readonly service: UsersService;
};

type UserIdParams = { readonly id: number };

export const usersRoutes: FastifyPluginCallback<UsersRoutesOptions> = (fastify, options, done) => {
  const { service } = options;

  fastify.post<{ Body: CreateUserCommand }>(
    '/users',
    { schema: createUserSchema },
    (request, reply) => reply.code(201).send(service.create(request.body)),
  );

  fastify.get('/users', { schema: listUsersSchema }, () => service.list());

  fastify.get<{ Params: UserIdParams }>('/users/:id', { schema: getUserSchema }, (request) =>
    service.getById(request.params.id),
  );

  fastify.patch<{ Params: UserIdParams; Body: UpdateUserCommand }>(
    '/users/:id',
    { schema: updateUserSchema },
    (request) => service.update(request.params.id, request.body),
  );

  done();
};
