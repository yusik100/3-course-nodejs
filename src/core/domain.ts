/**
 * Спільні доменні примітиви (ролі, статуси, пріоритети) — щоб модулі не імпортували файли один одного.
 * Значення збігаються з CHECK-констрейнтами в `src/db/schema.sql` (docs/er-diagram.md).
 */

export const ROLES = ['client', 'agent', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ['new', 'in_progress', 'resolved'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
