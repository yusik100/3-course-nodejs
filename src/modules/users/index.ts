/**
 * Модуль Users: плагін Fastify, що підключає роути з переданим сервісом (spec-01, spec-02 §2).
 * Запис у таблицю `users` — лише цей модуль; Tickets читає користувачів власним JOIN.
 */

import type { FastifyPluginCallback } from 'fastify';

import { usersRoutes } from './users.routes.js';
import type { UsersService } from './users.service.js';

export type UsersModuleOptions = {
  readonly service: UsersService;
};

export const usersModule: FastifyPluginCallback<UsersModuleOptions> = (fastify, options, done) => {
  fastify.register(usersRoutes, { service: options.service });
  done();
};
