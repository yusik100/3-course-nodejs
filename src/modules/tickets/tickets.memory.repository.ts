/**
 * In-memory реалізація порту Tickets (spec-02, §2): той самий контракт без SQL.
 * Імена авторів беруться з порту `UsersDirectory` — модуль Tickets не імпортує файли Users.
 */

import { createIdGenerator } from '../../core/ids.js';
import type { TicketsRepository } from './tickets.repository.js';
import type {
  Author,
  CreateTicketIdempotentInput,
  IdempotentTicketResult,
  NewComment,
  NewTicket,
  Ticket,
  TicketComment,
  TicketFilter,
  TicketWithAuthors,
  UsersDirectory,
} from './tickets.types.js';

export const createMemoryTicketsRepository = (users: UsersDirectory): TicketsRepository => {
  const tickets = new Map<number, Ticket>();
  const comments = new Map<number, TicketComment>();
  const idempotency = new Map<string, { readonly requestHash: string; readonly ticket: Ticket }>();
  const nextTicketId = createIdGenerator();
  const nextCommentId = createIdGenerator();

  const authorOf = (id: number): Author => ({
    id,
    displayName: users.findById(id)?.displayName ?? `user-${id}`,
  });

  const withAuthors = (ticket: Ticket): TicketWithAuthors => ({
    ...ticket,
    reporter: authorOf(ticket.reporterId),
    assignee: ticket.assigneeId === null ? null : authorOf(ticket.assigneeId),
  });

  const insertTicket = (input: NewTicket): Ticket => {
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: nextTicketId(),
      title: input.title,
      description: input.description,
      status: 'new',
      priority: input.priority,
      reporterId: input.reporterId,
      assigneeId: null,
      createdAt: now,
      updatedAt: now,
    };
    tickets.set(ticket.id, ticket);
    return ticket;
  };

  const updateTicket = (
    id: number,
    patch: Partial<Pick<Ticket, 'status' | 'assigneeId'>>,
  ): Ticket | undefined => {
    const current = tickets.get(id);
    if (current === undefined) return undefined;

    const updated: Ticket = { ...current, ...patch, updatedAt: new Date().toISOString() };
    tickets.set(id, updated);
    return updated;
  };

  return {
    create: insertTicket,

    findById: (id: number): Ticket | undefined => tickets.get(id),

    findWithAuthors: (id: number): TicketWithAuthors | undefined => {
      const ticket = tickets.get(id);
      return ticket === undefined ? undefined : withAuthors(ticket);
    },

    listWithAuthors: (filter: TicketFilter): TicketWithAuthors[] =>
      [...tickets.values()]
        .filter(
          (ticket) =>
            (filter.status === undefined || ticket.status === filter.status) &&
            (filter.assigneeId === undefined || ticket.assigneeId === filter.assigneeId),
        )
        .sort((left, right) => left.id - right.id)
        .map(withAuthors),

    countComments: (ticketIds: readonly number[]): ReadonlyMap<number, number> => {
      const counts = new Map<number, number>();
      for (const comment of comments.values()) {
        if (!ticketIds.includes(comment.ticketId)) continue;
        counts.set(comment.ticketId, (counts.get(comment.ticketId) ?? 0) + 1);
      }
      return counts;
    },

    listComments: (ticketId: number): TicketComment[] =>
      [...comments.values()]
        .filter((comment) => comment.ticketId === ticketId)
        .sort((left, right) => left.id - right.id),

    updateStatus: (id: number, status: Ticket['status']): Ticket | undefined =>
      updateTicket(id, { status }),

    updateAssignee: (id: number, assigneeId: number | null): Ticket | undefined =>
      updateTicket(id, { assigneeId }),

    addComment: (input: NewComment): TicketComment => {
      const comment: TicketComment = {
        id: nextCommentId(),
        ticketId: input.ticketId,
        author: authorOf(input.authorId),
        body: input.body,
        createdAt: new Date().toISOString(),
      };
      comments.set(comment.id, comment);
      return comment;
    },

    createTicketIdempotent: (input: CreateTicketIdempotentInput): IdempotentTicketResult => {
      const storageKey = `${input.userId}:${input.key}`;
      const existing = idempotency.get(storageKey);
      if (existing !== undefined) {
        if (existing.requestHash !== input.requestHash) return { kind: 'key-reused' };
        return { kind: 'replayed', ticket: existing.ticket };
      }

      const ticket = insertTicket(input.ticket);
      idempotency.set(storageKey, { requestHash: input.requestHash, ticket });
      return { kind: 'created', ticket };
    },
  };
};
