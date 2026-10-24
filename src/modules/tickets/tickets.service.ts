/**
 * Бізнес-правила Tickets (spec-02 §7–§8): переходи статусів, роль виконавця, ідемпотентність, 404/403/409.
 * SQL і Fastify тут відсутні; помилки — кастомні класи з `core/errors.ts`.
 */

import { createHash } from 'node:crypto';

import type { TicketStatus } from '../../core/domain.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../core/errors.js';
import type { TicketsRepository } from './tickets.repository.js';
import type {
  CreateTicketCommand,
  DirectoryUser,
  Ticket,
  TicketComment,
  TicketDetails,
  TicketFilter,
  TicketListItem,
  UsersDirectory,
} from './tickets.types.js';

/** spec-01: `new → in_progress → resolved`, reopen `resolved → in_progress`; інші переходи → 409. */
const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['in_progress'],
};

export type TicketsServiceDeps = {
  readonly tickets: TicketsRepository;
  readonly users: UsersDirectory;
};

export type CreateTicketResult = {
  readonly ticket: Ticket;
  readonly replayed: boolean;
};

export type TicketsService = {
  readonly create: (
    actorId: number,
    command: CreateTicketCommand,
    idempotencyKey: string,
  ) => CreateTicketResult;
  readonly get: (id: number) => TicketDetails;
  readonly list: (filter: TicketFilter) => TicketListItem[];
  readonly listComments: (ticketId: number) => readonly TicketComment[];
  readonly addComment: (actorId: number, ticketId: number, body: string) => TicketComment;
  readonly changeStatus: (id: number, status: TicketStatus) => Ticket;
  readonly assign: (actorId: number, id: number, assigneeId: number | null) => Ticket;
};

const hashRequest = (title: string, description: string | null, priority: string): string =>
  createHash('sha256').update(JSON.stringify({ title, description, priority })).digest('hex');

export const createTicketsService = ({ tickets, users }: TicketsServiceDeps): TicketsService => {
  const requireActor = (actorId: number): DirectoryUser => {
    const actor = users.findById(actorId);
    if (actor === undefined)
      throw new UnauthorizedError(`Actor ${actorId} not found`, { id: actorId });
    return actor;
  };

  const requireTicket = (id: number): Ticket => {
    const ticket = tickets.findById(id);
    if (ticket === undefined) throw new NotFoundError(`Ticket ${id} not found`, { id });
    return ticket;
  };

  return {
    create: (
      actorId: number,
      command: CreateTicketCommand,
      idempotencyKey: string,
    ): CreateTicketResult => {
      requireActor(actorId);

      const title = command.title.trim();
      const description = command.description?.trim() ?? '';
      const priority = command.priority ?? 'normal';
      const normalizedDescription = description === '' ? null : description;

      const result = tickets.createTicketIdempotent({
        key: idempotencyKey,
        userId: actorId,
        requestHash: hashRequest(title, normalizedDescription, priority),
        ticket: { title, description: normalizedDescription, priority, reporterId: actorId },
      });

      if (result.kind === 'key-reused') {
        throw new ConflictError(
          'IDEMPOTENCY_KEY_REUSED',
          'Idempotency-Key was already used with a different request body',
          { key: idempotencyKey },
        );
      }

      return { ticket: result.ticket, replayed: result.kind === 'replayed' };
    },

    get: (id: number): TicketDetails => {
      const ticket = tickets.findWithAuthors(id);
      if (ticket === undefined) throw new NotFoundError(`Ticket ${id} not found`, { id });
      return { ...ticket, comments: tickets.listComments(id) };
    },

    list: (filter: TicketFilter): TicketListItem[] => {
      const items = tickets.listWithAuthors(filter);
      const counts = tickets.countComments(items.map((item) => item.id));
      return items.map((item) => ({ ...item, commentsCount: counts.get(item.id) ?? 0 }));
    },

    listComments: (ticketId: number): readonly TicketComment[] => {
      requireTicket(ticketId);
      return tickets.listComments(ticketId);
    },

    addComment: (actorId: number, ticketId: number, body: string): TicketComment => {
      requireActor(actorId);
      requireTicket(ticketId);

      const text = body.trim();
      if (text.length === 0) throw new ValidationError('Comment body must not be empty');

      return tickets.addComment({ ticketId, authorId: actorId, body: text });
    },

    changeStatus: (id: number, status: TicketStatus): Ticket => {
      const current = requireTicket(id);
      if (!ALLOWED_TRANSITIONS[current.status].includes(status)) {
        throw new ConflictError(
          'INVALID_STATUS_TRANSITION',
          `Cannot change status from "${current.status}" to "${status}"`,
          { from: current.status, to: status },
        );
      }

      const updated = tickets.updateStatus(id, status);
      if (updated === undefined) throw new NotFoundError(`Ticket ${id} not found`, { id });
      return updated;
    },

    assign: (actorId: number, id: number, assigneeId: number | null): Ticket => {
      const actor = requireActor(actorId);
      if (actor.role !== 'agent') {
        throw new ForbiddenError('Only agents can assign tickets', { actorId, role: actor.role });
      }
      requireTicket(id);

      if (assigneeId !== null) {
        const assignee = users.findById(assigneeId);
        if (assignee === undefined)
          throw new NotFoundError(`User ${assigneeId} not found`, { id: assigneeId });
        if (assignee.role !== 'agent') {
          throw new ConflictError('ASSIGNEE_NOT_AGENT', `User ${assigneeId} is not an agent`, {
            id: assigneeId,
          });
        }
      }

      const updated = tickets.updateAssignee(id, assigneeId);
      if (updated === undefined) throw new NotFoundError(`Ticket ${id} not found`, { id });
      return updated;
    },
  };
};
