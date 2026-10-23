/**
 * Порт доступу до `tickets` / `ticket_comments` + мапінг рядків (spec-02, §1–§3, §8, §10).
 *
 * Читання авторів — прямим JOIN у SQLite-реалізації; записів у `users` тут немає (контракт spec-01).
 */

import type { TicketStatus } from '../../core/domain.js';
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
} from './tickets.types.js';

export type TicketRow = {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: Ticket['priority'];
  readonly reporter_id: number;
  readonly assignee_id: number | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type TicketWithAuthorsRow = TicketRow & {
  readonly reporter_display_name: string;
  readonly assignee_display_name: string | null;
};

export type CommentRow = {
  readonly id: number;
  readonly ticket_id: number;
  readonly author_id: number;
  readonly body: string;
  readonly created_at: string;
  readonly author_display_name: string;
};

export const mapTicketRow = (row: TicketRow): Ticket => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  priority: row.priority,
  reporterId: row.reporter_id,
  assigneeId: row.assignee_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toAuthor = (id: number, displayName: string): Author => ({ id, displayName });

export const mapTicketWithAuthors = (row: TicketWithAuthorsRow): TicketWithAuthors => ({
  ...mapTicketRow(row),
  reporter: toAuthor(row.reporter_id, row.reporter_display_name),
  assignee:
    row.assignee_id === null ? null : toAuthor(row.assignee_id, row.assignee_display_name ?? ''),
});

export const mapCommentRow = (row: CommentRow): TicketComment => ({
  id: row.id,
  ticketId: row.ticket_id,
  author: toAuthor(row.author_id, row.author_display_name),
  body: row.body,
  createdAt: row.created_at,
});

export type TicketsRepository = {
  readonly create: (input: NewTicket) => Ticket;
  readonly findById: (id: number) => Ticket | undefined;
  readonly findWithAuthors: (id: number) => TicketWithAuthors | undefined;
  readonly listWithAuthors: (filter: TicketFilter) => TicketWithAuthors[];
  readonly countComments: (ticketIds: readonly number[]) => ReadonlyMap<number, number>;
  readonly listComments: (ticketId: number) => TicketComment[];
  readonly updateStatus: (id: number, status: TicketStatus) => Ticket | undefined;
  readonly updateAssignee: (id: number, assigneeId: number | null) => Ticket | undefined;
  readonly addComment: (input: NewComment) => TicketComment;
  readonly createTicketIdempotent: (input: CreateTicketIdempotentInput) => IdempotentTicketResult;
};
