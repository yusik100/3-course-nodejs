/**
 * Доменні типи модуля Tickets (docs/er-diagram.md, spec-02 §7–§8).
 */

import type { Role, TicketPriority, TicketStatus } from '../../core/domain.js';

export type Ticket = {
  readonly id: number;
  readonly title: string;
  readonly description: string | null;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly reporterId: number;
  readonly assigneeId: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type Author = {
  readonly id: number;
  readonly displayName: string;
};

export type TicketWithAuthors = Ticket & {
  readonly reporter: Author;
  readonly assignee: Author | null;
};

export type TicketListItem = TicketWithAuthors & {
  readonly commentsCount: number;
};

export type TicketComment = {
  readonly id: number;
  readonly ticketId: number;
  readonly author: Author;
  readonly body: string;
  readonly createdAt: string;
};

export type TicketDetails = TicketWithAuthors & {
  readonly comments: readonly TicketComment[];
};

export type NewTicket = {
  readonly title: string;
  readonly description: string | null;
  readonly priority: TicketPriority;
  readonly reporterId: number;
};

export type NewComment = {
  readonly ticketId: number;
  readonly authorId: number;
  readonly body: string;
};

export type TicketFilter = {
  readonly status?: TicketStatus;
  readonly assigneeId?: number;
};

export type CreateTicketCommand = {
  readonly title: string;
  readonly description?: string;
  readonly priority?: TicketPriority;
};

export type CreateTicketIdempotentInput = {
  readonly key: string;
  readonly userId: number;
  readonly requestHash: string;
  readonly ticket: NewTicket;
};

export type IdempotentTicketResult =
  | { readonly kind: 'created'; readonly ticket: Ticket }
  | { readonly kind: 'replayed'; readonly ticket: Ticket }
  | { readonly kind: 'key-reused' };

/** Структурний порт до модуля Users: Tickets не імпортує його файли (spec-01, DoD). */
export type DirectoryUser = {
  readonly id: number;
  readonly role: Role;
  readonly displayName: string;
};

export type UsersDirectory = {
  readonly findById: (id: number) => DirectoryUser | undefined;
};
