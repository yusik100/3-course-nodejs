/**
 * Unit-тести бізнес-правил Tickets (spec-03, AC-2; spec-02 §7–§8).
 *
 * Fastify, SQLite і mock-фреймворки не використовуються: лише ручні фейки портів.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { TicketStatus } from '../../src/core/domain.js';
import { AppError } from '../../src/core/errors.js';
import type { TicketsRepository } from '../../src/modules/tickets/tickets.repository.js';
import { createTicketsService } from '../../src/modules/tickets/tickets.service.js';
import type {
  CreateTicketIdempotentInput,
  DirectoryUser,
  Ticket,
  TicketComment,
  TicketWithAuthors,
} from '../../src/modules/tickets/tickets.types.js';
import { createFakeTicketsRepository, createFakeUsersDirectory } from '../support/fakes.js';

const NOW = '2026-01-01T00:00:00.000Z';

const makeTicket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 1,
  title: 'Test ticket',
  description: null,
  status: 'new',
  priority: 'normal',
  reporterId: 1,
  assigneeId: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeWithAuthors = (overrides: Partial<TicketWithAuthors> = {}): TicketWithAuthors => ({
  ...makeTicket(),
  reporter: { id: 1, displayName: 'Client' },
  assignee: null,
  ...overrides,
});

const makeComment = (overrides: Partial<TicketComment> = {}): TicketComment => ({
  id: 1,
  ticketId: 1,
  author: { id: 1, displayName: 'Client' },
  body: 'Comment',
  createdAt: NOW,
  ...overrides,
});

const USERS: readonly DirectoryUser[] = [
  { id: 1, role: 'client', displayName: 'Client' },
  { id: 2, role: 'agent', displayName: 'Agent' },
];

const createService = (
  overrides: Partial<TicketsRepository> = {},
  users: readonly DirectoryUser[] = USERS,
) =>
  createTicketsService({
    tickets: createFakeTicketsRepository(overrides),
    users: createFakeUsersDirectory(users),
  });

const expectAppError = (operation: () => unknown, code: string): void => {
  assert.throws(operation, (error: unknown) => error instanceof AppError && error.code === code);
};

describe('TicketsService.create', () => {
  it('кидає Unauthorized, якщо актора не існує', () => {
    const service = createService({}, []);
    expectAppError(() => service.create(99, { title: 'Hello' }, 'key-1'), 'UNAUTHORIZED');
  });

  it('нормалізує title/description/priority і передає key у репозиторій', () => {
    let captured: CreateTicketIdempotentInput | undefined;
    const service = createService({
      createTicketIdempotent: (input) => {
        captured = input;
        return { kind: 'created', ticket: makeTicket() };
      },
    });

    const result = service.create(1, { title: '  Hello  ', description: '  Desc  ' }, 'key-1');

    assert.ok(captured !== undefined);
    assert.equal(captured.key, 'key-1');
    assert.equal(captured.userId, 1);
    assert.deepEqual(captured.ticket, {
      title: 'Hello',
      description: 'Desc',
      priority: 'normal',
      reporterId: 1,
    });
    assert.equal(result.replayed, false);
  });

  it('перетворює порожній опис на null і зберігає явний priority', () => {
    let captured: CreateTicketIdempotentInput | undefined;
    const service = createService({
      createTicketIdempotent: (input) => {
        captured = input;
        return { kind: 'created', ticket: makeTicket() };
      },
    });

    service.create(1, { title: 'Hello', description: '   ', priority: 'high' }, 'key-2');

    assert.ok(captured !== undefined);
    assert.equal(captured.ticket.description, null);
    assert.equal(captured.ticket.priority, 'high');
  });

  it('перетворює відсутній опис на null', () => {
    let captured: CreateTicketIdempotentInput | undefined;
    const service = createService({
      createTicketIdempotent: (input) => {
        captured = input;
        return { kind: 'created', ticket: makeTicket() };
      },
    });

    service.create(1, { title: 'Hello' }, 'key-undefined-description');

    assert.ok(captured !== undefined);
    assert.equal(captured.ticket.description, null);
  });

  it('повертає replayed=true, якщо репозиторій повернув replay', () => {
    const service = createService({
      createTicketIdempotent: () => ({ kind: 'replayed', ticket: makeTicket() }),
    });

    assert.equal(service.create(1, { title: 'Hello' }, 'key-3').replayed, true);
  });

  it('кидає Conflict, якщо ключ уже використаний з іншим тілом', () => {
    const service = createService({
      createTicketIdempotent: () => ({ kind: 'key-reused' }),
    });

    expectAppError(() => service.create(1, { title: 'Hello' }, 'key-4'), 'IDEMPOTENCY_KEY_REUSED');
  });

  it('хеш залежить від нормалізованих title/description/priority', () => {
    const hashes: string[] = [];
    const service = createService({
      createTicketIdempotent: (input) => {
        hashes.push(input.requestHash);
        return { kind: 'created', ticket: makeTicket() };
      },
    });

    service.create(1, { title: 'Same', description: 'Body', priority: 'high' }, 'a');
    service.create(1, { title: ' Same ', description: ' Body ', priority: 'high' }, 'b');
    service.create(1, { title: 'Same', description: 'Other', priority: 'high' }, 'c');

    assert.equal(hashes[0], hashes[1]);
    assert.notEqual(hashes[0], hashes[2]);
  });
});

describe('TicketsService.get', () => {
  it('кидає NotFound для невідомого тикета', () => {
    const service = createService();
    expectAppError(() => service.get(999), 'NOT_FOUND');
  });

  it('повертає деталі разом із коментарями', () => {
    const service = createService({
      findWithAuthors: () => makeWithAuthors({ id: 5 }),
      listComments: (ticketId) => [makeComment({ ticketId })],
    });

    const details = service.get(5);

    assert.equal(details.id, 5);
    assert.equal(details.comments.length, 1);
    assert.equal(details.comments[0]?.ticketId, 5);
  });
});

describe('TicketsService.list', () => {
  it('передає фільтр і додає commentsCount, включно з нулем', () => {
    const service = createService({
      listWithAuthors: (filter) => {
        assert.deepEqual(filter, { status: 'new' });
        return [makeWithAuthors({ id: 1 }), makeWithAuthors({ id: 2 })];
      },
      countComments: (ticketIds) => {
        assert.deepEqual(ticketIds, [1, 2]);
        return new Map([[1, 3]]);
      },
    });

    const items = service.list({ status: 'new' });

    assert.equal(items[0]?.commentsCount, 3);
    assert.equal(items[1]?.commentsCount, 0);
  });

  it('повертає порожній список', () => {
    const service = createService({ listWithAuthors: () => [] });
    assert.deepEqual(service.list({}), []);
  });
});

describe('TicketsService.listComments', () => {
  it('кидає NotFound, якщо тикета немає', () => {
    const service = createService();
    expectAppError(() => service.listComments(999), 'NOT_FOUND');
  });

  it('повертає коментарі наявного тикета', () => {
    const service = createService({
      findById: () => makeTicket({ id: 7 }),
      listComments: (ticketId) => [makeComment({ ticketId, body: 'First' })],
    });

    assert.equal(service.listComments(7)[0]?.body, 'First');
  });
});

describe('TicketsService.addComment', () => {
  it('кидає Unauthorized, якщо актора не існує', () => {
    const service = createService({}, []);
    expectAppError(() => service.addComment(99, 1, 'Text'), 'UNAUTHORIZED');
  });

  it('кидає NotFound, якщо тикета немає', () => {
    const service = createService();
    expectAppError(() => service.addComment(1, 999, 'Text'), 'NOT_FOUND');
  });

  it('кидає ValidationError для порожнього тіла', () => {
    const service = createService({ findById: () => makeTicket() });
    expectAppError(() => service.addComment(1, 1, '   '), 'VALIDATION_FAILED');
  });

  it('trim-ить тіло і передає автора/тикет у репозиторій', () => {
    let captured:
      { readonly ticketId: number; readonly authorId: number; readonly body: string } | undefined;
    const service = createService({
      findById: () => makeTicket(),
      addComment: (input) => {
        captured = input;
        return makeComment({ ticketId: input.ticketId, body: input.body });
      },
    });

    const comment = service.addComment(1, 1, '  Looking  ');

    assert.ok(captured !== undefined);
    assert.deepEqual(captured, { ticketId: 1, authorId: 1, body: 'Looking' });
    assert.equal(comment.body, 'Looking');
  });
});

describe('TicketsService.changeStatus', () => {
  it('кидає NotFound для невідомого тикета', () => {
    const service = createService();
    expectAppError(() => service.changeStatus(999, 'in_progress'), 'NOT_FOUND');
  });

  const allowed: readonly (readonly [TicketStatus, TicketStatus])[] = [
    ['new', 'in_progress'],
    ['in_progress', 'resolved'],
    ['resolved', 'in_progress'],
  ];

  for (const [from, to] of allowed) {
    it(`дозволяє перехід ${from} → ${to}`, () => {
      const service = createService({
        findById: () => makeTicket({ status: from }),
        updateStatus: (id, status) => makeTicket({ id, status }),
      });

      assert.equal(service.changeStatus(1, to).status, to);
    });
  }

  const invalid: readonly (readonly [TicketStatus, TicketStatus])[] = [
    ['new', 'resolved'],
    ['in_progress', 'new'],
    ['resolved', 'resolved'],
  ];

  for (const [from, to] of invalid) {
    it(`відхиляє перехід ${from} → ${to}`, () => {
      const service = createService({ findById: () => makeTicket({ status: from }) });
      expectAppError(() => service.changeStatus(1, to), 'INVALID_STATUS_TRANSITION');
    });
  }

  it('кидає NotFound, якщо updateStatus не знайшов тикет', () => {
    const service = createService({
      findById: () => makeTicket({ status: 'new' }),
      updateStatus: () => undefined,
    });

    expectAppError(() => service.changeStatus(1, 'in_progress'), 'NOT_FOUND');
  });
});

describe('TicketsService.assign', () => {
  it('кидає Unauthorized, якщо актора не існує', () => {
    const service = createService({}, []);
    expectAppError(() => service.assign(99, 1, null), 'UNAUTHORIZED');
  });

  it('кидає Forbidden, якщо актор не agent', () => {
    const service = createService();
    expectAppError(() => service.assign(1, 1, 2), 'FORBIDDEN');
  });

  it('кидає NotFound, якщо тикета немає', () => {
    const service = createService();
    expectAppError(() => service.assign(2, 999, null), 'NOT_FOUND');
  });

  it('кидає NotFound, якщо тикета немає, навіть із невалідним assignee', () => {
    let updateCalled = false;
    const service = createService({
      findById: () => undefined,
      updateAssignee: (id, assigneeId) => {
        updateCalled = true;
        return makeTicket({ id, assigneeId });
      },
    });

    expectAppError(() => service.assign(2, 999, 1), 'NOT_FOUND');
    assert.equal(updateCalled, false);
  });

  it('кидає NotFound, якщо виконавця не існує', () => {
    const service = createService({ findById: () => makeTicket() });
    expectAppError(() => service.assign(2, 1, 99), 'NOT_FOUND');
  });

  it('кидає Conflict, якщо виконавець не agent', () => {
    const service = createService({ findById: () => makeTicket() });
    expectAppError(() => service.assign(2, 1, 1), 'ASSIGNEE_NOT_AGENT');
  });

  it('знімає виконавця через null', () => {
    let captured: number | null | undefined;
    const service = createService({
      findById: () => makeTicket({ assigneeId: 2 }),
      updateAssignee: (id, assigneeId) => {
        captured = assigneeId;
        return makeTicket({ id, assigneeId });
      },
    });

    const updated = service.assign(2, 1, null);

    assert.equal(captured, null);
    assert.equal(updated.assigneeId, null);
  });

  it('призначає agent-а виконавцем', () => {
    let captured: number | null | undefined;
    const service = createService({
      findById: () => makeTicket(),
      updateAssignee: (id, assigneeId) => {
        captured = assigneeId;
        return makeTicket({ id, assigneeId });
      },
    });

    const updated = service.assign(2, 1, 2);

    assert.equal(captured, 2);
    assert.equal(updated.assigneeId, 2);
  });

  it('кидає NotFound, якщо updateAssignee не знайшов тикет', () => {
    const service = createService({
      findById: () => makeTicket(),
      updateAssignee: () => undefined,
    });

    expectAppError(() => service.assign(2, 1, null), 'NOT_FOUND');
  });
});
