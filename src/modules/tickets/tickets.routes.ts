/**
 * HTTP-шар модуля Tickets (spec-02, §1, §7–§8): схема → сервіс → статус-код.
 * Актор береться із заголовка `X-User-Id`; ключ ідемпотентності — з `Idempotency-Key`.
 */

import type { FastifyPluginCallback } from 'fastify';

import { requireActorId } from '../../core/actor.js';
import type { TicketStatus } from '../../core/domain.js';
import {
  createCommentSchema,
  createTicketSchema,
  getTicketSchema,
  listCommentsSchema,
  listTicketsSchema,
  updateTicketAssigneeSchema,
  updateTicketStatusSchema,
} from './tickets.schema.js';
import type { TicketsService } from './tickets.service.js';
import type { CreateTicketCommand, TicketFilter } from './tickets.types.js';

export type TicketsRoutesOptions = {
  readonly service: TicketsService;
};

type TicketIdParams = { readonly id: number };
type CreateTicketHeaders = { readonly 'idempotency-key': string };
type StatusBody = { readonly status: TicketStatus };
type AssigneeBody = { readonly assigneeId: number | null };
type CommentBody = { readonly body: string };

export const ticketsRoutes: FastifyPluginCallback<TicketsRoutesOptions> = (
  fastify,
  options,
  done,
) => {
  const { service } = options;

  fastify.post<{ Body: CreateTicketCommand; Headers: CreateTicketHeaders }>(
    '/tickets',
    { schema: createTicketSchema },
    (request, reply) => {
      const actorId = requireActorId(request.headers);
      const result = service.create(actorId, request.body, request.headers['idempotency-key']);

      if (result.replayed) reply.header('Idempotency-Replayed', 'true');
      return reply.code(201).send(result.ticket);
    },
  );

  fastify.get<{ Querystring: TicketFilter }>('/tickets', { schema: listTicketsSchema }, (request) =>
    service.list(request.query),
  );

  fastify.get<{ Params: TicketIdParams }>('/tickets/:id', { schema: getTicketSchema }, (request) =>
    service.get(request.params.id),
  );

  fastify.patch<{ Params: TicketIdParams; Body: StatusBody }>(
    '/tickets/:id/status',
    { schema: updateTicketStatusSchema },
    (request) => {
      requireActorId(request.headers);
      return service.changeStatus(request.params.id, request.body.status);
    },
  );

  fastify.patch<{ Params: TicketIdParams; Body: AssigneeBody }>(
    '/tickets/:id/assignee',
    { schema: updateTicketAssigneeSchema },
    (request) => {
      const actorId = requireActorId(request.headers);
      return service.assign(actorId, request.params.id, request.body.assigneeId);
    },
  );

  fastify.get<{ Params: TicketIdParams }>(
    '/tickets/:id/comments',
    { schema: listCommentsSchema },
    (request) => service.listComments(request.params.id),
  );

  fastify.post<{ Params: TicketIdParams; Body: CommentBody }>(
    '/tickets/:id/comments',
    { schema: createCommentSchema },
    (request, reply) => {
      const actorId = requireActorId(request.headers);
      const comment = service.addComment(actorId, request.params.id, request.body.body);
      return reply.code(201).send(comment);
    },
  );

  done();
};
