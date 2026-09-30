# Spec 01: каркас проєкту, інженерні стандарти та дизайн структури

Ітерація 1 · Статус: draft · 2026-09-30 · Шаблон: `standards/spec-format.md`

## Context

- **Problem:** на старті курсу немає ні каркаса застосунку, ні власних інженерних стандартів, ні спроєктованої
  структури — а всі наступні ітерації спираються саме на них.
- **Current behavior:** існує лише ідея проєкту; коду, тестів, домовленостей про формат робіт немає.
- **Users or systems affected:** автор (усе наступне навчання), рев'юер, який читатиме spec і `standards/`.

## Goal

- **The smallest useful outcome:** готовий каркас на весь курс — репозиторій із README і налаштованими пакетами,
  стиль коду й лінтер, git-хуки (формат, лінт, smoke-тест, збірка), `standards/` із власними форматами
  (spec, ADR/MADR, DoD, перелік перевірок) та spec, у якому **спроєктовано структуру застосунку**, модулі
  Users і Tickets, модель даних (ER) і оновлення даних за ключовими сценаріями. Бізнес-логіку ще не пишемо.

## Scope

- **In scope:** репозиторій + README з ідеєю; залежності (`type: module`, Fastify, TypeScript, tsx) і скрипти;
  стиль коду (Prettier) і статичний аналіз (ESLint flat config + typescript-eslint); `Makefile`; git-хуки
  (`pre-commit` — формат і лінт застейджених файлів, `pre-push` — smoke-тест, типи, збірка); `standards/`;
  spec зі структурою застосунку й моделлю даних; аудит структури та залежностей.
- **Allowed write paths:** `standards/**`, `docs/**`, `README.md`, `package.json`, `Makefile`, `tsconfig.json`,
  `eslint.config.js`, `.prettierrc`, `.husky/**`, `src/**` (лише каркас), `test/**`.
- **Read-only context:** `package-lock.json`, `.gitignore`, `node_modules/**`.

## Technical Implementation (Адаптивний розділ)

> _Цей розділ змінюється залежно від завдання._

**Структура репозиторію (спроєктовано):**

- `standards/` — `spec-format.md`, `madr-format.md`, `definition-of-done.md`, `checks.md`.
- `docs/` — `specs/spec-01.md` (цей документ), `er-diagram.md` (ER у mermaid),
  `decisions/0001-use-node-sqlite.md` (ADR-0001), `audit-01.md` (аудит ітерації).
- `src/` — `config/`, `plugins/`, `core/`, `db/`, `modules/users/`, `modules/tickets/`, `app.ts`, `index.ts`
  (структуру створено заглушками).
- `test/` — `smoke.test.ts` (мінімальний smoke-тест: `GET /health` через `app.inject()`).
- корінь — `README.md`, `Makefile`, `eslint.config.js`, `.prettierrc`, `tsconfig.json`, `tsconfig.build.json`
  (збірка без тестів), `package.json`, `.husky/`.

**Компоненти** (модульний моноліт: один процес, одна БД, по одній теці на модуль):

- **Users:** `index.ts` (плагін + роути) · `users.routes.ts` · `users.service.ts` (перевірки) ·
  `users.repository.ts` (SQL по `users`) · `users.schema.ts` · `users.types.ts`.
- **Tickets:** `index.ts` · `tickets.routes.ts` · `tickets.service.ts` (переходи статусів, перевірка виконавця) ·
  `tickets.repository.ts` (SQL по `tickets`, `ticket_comments`, JOIN до `users`) · `tickets.schema.ts` ·
  `tickets.types.ts`.
- **Спільне:** `config/env.ts` · `plugins/db.ts`, `plugins/error-handler.ts` · `core/errors.ts`, `core/ids.ts` ·
  `db/schema.sql`, `db/seed.sql`.

**Взаємодія:** модулі знають один одного лише через `id`. Читання — прямими JOIN (`tickets` ↔ `users`,
`tickets` ↔ `ticket_comments`); записи в чужу таблицю заборонені: `users` змінює лише модуль Users,
Tickets його тільки читає.

**Ендпоінти:** `/users`, `/users/:id`, `/tickets`, `/tickets/:id`, `/tickets/:id/comments` (GET/POST/PATCH);
актор — заголовок `X-User-Id` (JWT — окрема ітерація).

**Драйвер БД:** вбудований `node:sqlite` (`DatabaseSync`), Node ≥ 24 — рішення зафіксовано в ADR-0001
([`docs/decisions/0001-use-node-sqlite.md`](../decisions/0001-use-node-sqlite.md)).

**Дані (ER):** повна діаграма — [`docs/er-diagram.md`](../er-diagram.md). Стисло:

- `users(id, email↑unique, password_hash, display_name, role, created_at, updated_at)`
- `tickets(id, title, description?, status, priority, reporter_id→users, assignee_id→users?, created_at, updated_at)`
- `ticket_comments(id, ticket_id→tickets, author_id→users, body, created_at)`
- `role` — `client | agent | admin`, `status` — `new | in_progress | resolved`, `priority` — `low | normal | high`
  (усе через CHECK).
- Зв'язки: `users 1:N tickets` (reporter, assignee) і `users 1:N ticket_comments`; `tickets 1:N ticket_comments`
  (CASCADE); FK на `users` — RESTRICT.
- Інваріанти: email унікальний у lower case; `reporter_id` не змінюється; виконавець — лише `agent`.
- Ключі: `id` у всіх таблицях — `INTEGER PRIMARY KEY` (вирішено 2026-09-30; альтернативу UUID/TEXT відхилено:
  простіший SQL і типи, для цього проєкту достатньо).

**Статуси:** `new → in_progress`; `in_progress → resolved`; `resolved → in_progress` (reopen). Інші → 409.

**Оновлення даних за сценаріями** (один сценарій — одна транзакція):

| Сценарій             | Записи в БД                                                          |
| -------------------- | -------------------------------------------------------------------- |
| Створити користувача | `INSERT users(role='client')`; дубль email → 409                     |
| Змінити роль         | `UPDATE users.role, updated_at`; невалідна роль → 400                |
| Створити задачу      | `INSERT tickets(status='new', priority='normal', reporter_id=актор)` |
| Призначити виконавця | перевірка ролі → `UPDATE tickets.assignee_id, updated_at`            |
| Змінити статус       | перевірка переходу → `UPDATE tickets.status, updated_at`             |
| Додати коментар      | `INSERT ticket_comments` (без зміни `tickets.updated_at`)            |
| Читати задачу        | без записів: `tickets JOIN users` + коментарі                        |

## Non-goals

- **Explicitly excluded:** реалізація бізнес-логіки (роути, сервіси, репозиторії, SQL, міграції, seed) —
  наступні ітерації; JWT і хешування пароля; RBAC-гарди; довідники та історія подій; проєкти; дедлайни;
  вкладені й редаговані коментарі; пошук; видалення користувачів і задач; повний тестовий фреймворк
  (у цій ітерації — лише мінімальний smoke-тест).
- **Dependencies or contracts that must not change:** структура модулів і контракт зі spec, формат помилок,
  скрипти `package.json`, цілі `Makefile`, `standards/**`.

## Acceptance Criteria

- [x] AC-1: репозиторій створено, README описує ідею проєкту (Task Tracker API).
- [x] AC-2: налаштовано пакети (`type: module`, Fastify, TypeScript, tsx) і скрипти (`dev`, `build`, `start`,
      `lint`, `format`, `typecheck`).
- [x] AC-3: стиль коду й статичний аналіз — Prettier (`.prettierrc`) і ESLint flat config із `typescript-eslint`
      для TS; `make lint` і `make format-check` проходять без помилок.
- [x] AC-4: `standards/` містить власні формати: `spec-format.md`, `madr-format.md`, `definition-of-done.md`,
      `checks.md`.
- [x] AC-5: spec описує розбиття на модулі/компоненти та взаємодію, дані й зв'язки (ER-діаграма —
      `docs/er-diagram.md`) та оновлення даних за ключовими сценаріями.
- [x] AC-6: структура застосунку спроєктована й зафіксована в spec (дерево репозиторію та `src/`).
- [x] AC-7: git-хуки працюють: `pre-commit` — формат і лінт застейджених файлів (`lint-staged`); `pre-push` —
      smoke-тест (`npm run smoke`), перевірка типів і збірка.
- [x] AC-8: аудит виконано — структура репозиторію відповідає spec, складено топ-3 зайвих/неправильних
      залежностей ([`docs/audit-01.md`](../audit-01.md)).
- [x] AC-9: `make lint`, `make typecheck`, `make build`, `make smoke`, `make format-check` — без помилок.

## Evidence

- **Automated tests:** `test/smoke.test.ts` (вбудований `node:test` + `app.inject()`): `GET /health` → 200 зі
  `status=ok`; запуск — `npm run smoke` (`tsx --test`) і в `pre-push`. Інших тестів у цій ітерації немає.
- **Manual checks:** `make lint`, `make typecheck`, `make build`, `make smoke`, `make format-check`;
  `git hook run pre-commit` і `git hook run pre-push`; перевірка, що `node_modules/`, `dist/`, `.husky/_/`
  не потрапляють у git.
- **Logs, screenshots, metrics:** вивід команд у звіті; перелік топ-3 залежностей з аудиту.

## Open Questions

- _Відкритих питань немає._ Драйвер БД вирішено: `node:sqlite` (ADR-0001); тип `id` — `INTEGER PRIMARY KEY`
  (вирішено 2026-09-30). Обидва рішення — у Technical Implementation.

> If this spec conflicts with a prompt, this spec wins.
