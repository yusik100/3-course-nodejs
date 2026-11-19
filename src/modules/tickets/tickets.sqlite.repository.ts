/**
 * SQLite-реалізація порту Tickets (spec-02 §3, §8, §10; ADR-0003).
 *
 * - автори тикета — `JOIN users AS reporter` + `LEFT JOIN users AS assignee`, один запит на список;
 * - коментарі для списку — окремий запит `WHERE ticket_id IN (...)`, тобто рівно 2 запити (не N+1);
 * - ключ ідемпотентності й тикет пишуться однією транзакцією.
 */

import type { SqliteClient } from '../../db/client.js';
import { withRetry } from '../../db/retry.js';
import { empty, join, sql, type Sql } from '../../db/sql.js';
import {
  mapCommentRow,
  mapTicketRow,
  mapTicketWithAuthors,
  type CommentRow,
  type TicketRow,
  type TicketWithAuthorsRow,
  type TicketsRepository,
} from './tickets.repository.js';
import type {
  CreateTicketIdempotentInput,
  IdempotentTicketResult,
  NewComment,
  NewTicket,
  Ticket,
  TicketComment,
  TicketFilter,
  TicketWithAuthors,
} from './tickets.types.js';

type IdempotencyRow = {
  readonly request_hash: string;
  readonly response_json: string;
};

type CountRow = {
  readonly ticket_id: number;
  readonly total: number;
};

const TICKET_SELECT = sql`
  SELECT
    t.id, t.title, t.description, t.status, t.priority,
    t.reporter_id, t.assignee_id, t.created_at, t.updated_at,
    reporter.display_name AS reporter_display_name,
    assignee.display_name AS assignee_display_name
  FROM tickets t
  JOIN users reporter ON reporter.id = t.reporter_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
`;

const COMMENT_SELECT = sql`
  SELECT c.id, c.ticket_id, c.author_id, c.body, c.created_at, u.display_name AS author_display_name
  FROM ticket_comments c
  JOIN users u ON u.id = c.author_id
`;

const readComment = (client: SqliteClient, id: number): CommentRow | undefined =>
  client.get<CommentRow>(sql`${COMMENT_SELECT} WHERE c.id = ${id}`);

const insertTicket = (client: SqliteClient, input: NewTicket): Ticket => {
  const now = new Date().toISOString();
  const row = client.get<TicketRow>(sql`
    INSERT INTO tickets (title, description, status, priority, reporter_id, assignee_id, created_at, updated_at)
    VALUES (${input.title}, ${input.description}, 'new', ${input.priority}, ${input.reporterId}, NULL, ${now}, ${now})
    RETURNING *
  `);

  if (row === undefined) throw new Error('Inserted ticket could not be read back');
  return mapTicketRow(row);
};

export const createSqliteTicketsRepository = (client: SqliteClient): TicketsRepository => ({
  create: (input: NewTicket): Ticket =>
    withRetry(() => client.transaction(() => insertTicket(client, input))),

  findById: (id: number): Ticket | undefined => {
    const row = client.get<TicketRow>(sql`SELECT * FROM tickets WHERE id = ${id}`);
    return row === undefined ? undefined : mapTicketRow(row);
  },

  findWithAuthors: (id: number): TicketWithAuthors | undefined => {
    const row = client.get<TicketWithAuthorsRow>(sql`${TICKET_SELECT} WHERE t.id = ${id}`);
    return row === undefined ? undefined : mapTicketWithAuthors(row);
  },

  listWithAuthors: (filter: TicketFilter): TicketWithAuthors[] => {
    const conditions: Sql[] = [];
    if (filter.status !== undefined) conditions.push(sql`t.status = ${filter.status}`);
    if (filter.assigneeId !== undefined) conditions.push(sql`t.assignee_id = ${filter.assigneeId}`);
    const where = conditions.length === 0 ? empty : sql`WHERE ${join(conditions, ' AND ')}`;

    return client
      .all<TicketWithAuthorsRow>(sql`${TICKET_SELECT} ${where} ORDER BY t.id`)
      .map(mapTicketWithAuthors);
  },

  countComments: (ticketIds: readonly number[]): ReadonlyMap<number, number> => {
    if (ticketIds.length === 0) return new Map<number, number>();

    const rows = client.all<CountRow>(sql`
      SELECT ticket_id, COUNT(*) AS total
      FROM ticket_comments
      WHERE ticket_id IN (${join(ticketIds)})
      GROUP BY ticket_id
    `);

    return new Map(rows.map((row) => [row.ticket_id, row.total]));
  },

  listComments: (ticketId: number): TicketComment[] =>
    client
      .all<CommentRow>(sql`${COMMENT_SELECT} WHERE c.ticket_id = ${ticketId} ORDER BY c.id`)
      .map(mapCommentRow),

  updateStatus: (id: number, status: Ticket['status']): Ticket | undefined =>
    withRetry(() =>
      client.transaction(() => {
        const row = client.get<TicketRow>(sql`
          UPDATE tickets SET status = ${status}, updated_at = ${new Date().toISOString()}
          WHERE id = ${id}
          RETURNING *
        `);
        return row === undefined ? undefined : mapTicketRow(row);
      }),
    ),

  updateAssignee: (id: number, assigneeId: number | null): Ticket | undefined =>
    withRetry(() =>
      client.transaction(() => {
        const row = client.get<TicketRow>(sql`
          UPDATE tickets SET assignee_id = ${assigneeId}, updated_at = ${new Date().toISOString()}
          WHERE id = ${id}
          RETURNING *
        `);
        return row === undefined ? undefined : mapTicketRow(row);
      }),
    ),

  addComment: (input: NewComment): TicketComment =>
    withRetry(() =>
      client.transaction(() => {
        const inserted = client.run(sql`
          INSERT INTO ticket_comments (ticket_id, author_id, body, created_at)
          VALUES (${input.ticketId}, ${input.authorId}, ${input.body}, ${new Date().toISOString()})
        `);

        const row = readComment(client, inserted.lastInsertRowid);
        if (row === undefined) throw new Error('Inserted comment could not be read back');
        return mapCommentRow(row);
      }),
    ),

  createTicketIdempotent: (input: CreateTicketIdempotentInput): IdempotentTicketResult =>
    withRetry(() =>
      client.transaction(() => {
        const existing = client.get<IdempotencyRow>(sql`
          SELECT request_hash, response_json
          FROM idempotency_keys
          WHERE key = ${input.key} AND user_id = ${input.userId}
        `);

        if (existing !== undefined) {
          if (existing.request_hash !== input.requestHash) return { kind: 'key-reused' } as const;
          const parsed: unknown = JSON.parse(existing.response_json);
          return { kind: 'replayed', ticket: parsed as Ticket } as const;
        }

        const ticket = insertTicket(client, input.ticket);
        client.run(sql`
          INSERT INTO idempotency_keys (key, user_id, method, path, request_hash, status_code, response_json, created_at)
          VALUES (
            ${input.key}, ${input.userId}, 'POST', '/tickets',
            ${input.requestHash}, 201, ${JSON.stringify(ticket)}, ${new Date().toISOString()}
          )
        `);

        return { kind: 'created', ticket } as const;
      }),
    ),
});
