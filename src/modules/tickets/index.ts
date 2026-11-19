/**
 * Модуль Tickets: плагін Fastify, що підключає роути з переданим сервісом (spec-02, §2).
 * Життєвий цикл задач і коментарі; з модулем Users — лише через `id` та структурний `UsersDirectory`.
 */

import type { FastifyPluginCallback } from 'fastify';

import { ticketsRoutes } from './tickets.routes.js';
import type { TicketsService } from './tickets.service.js';

export type TicketsModuleOptions = {
  readonly service: TicketsService;
};

export const ticketsModule: FastifyPluginCallback<TicketsModuleOptions> = (
  fastify,
  options,
  done,
) => {
  fastify.register(ticketsRoutes, { service: options.service });
  done();
};
