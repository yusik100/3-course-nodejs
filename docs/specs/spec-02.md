# Spec 02: робочий API — in-memory прототип, потім `node:sqlite`

Ітерація 2 · Статус: draft · 2026-10-23 · Шаблон: `standards/spec-format.md`

## Context

- **Problem:** після ітерації 1 є каркас і лише `GET /health`; `modules/*`, `plugins/*`, `core/*`, `db/schema.sql` —
  заглушки `export {}`. Жодного HTTP-сценарію, БД і наскрізного логування немає, а всі наступні ітерації (JWT,
  RBAC, історія) спираються саме на них.
- **Current behavior:** модулі Users/Tickets нічого не роблять; даних немає ніде, крім пам'яті процесу; єдиний
  тест — `test/smoke.test.ts`.
- **Users or systems affected:** клієнти API, рев'юер, модулі Users/Tickets і майбутні ітерації.

## Goal

- **The smallest useful outcome:** робочий API (користувачі, тикети, статуси, виконавець, коментарі), який спочатку
  працює на in-memory реалізації, а далі — на реальній БД `node:sqlite`: шари розділені, помилки обробляє один
  глобальний обробник, `X-Request-Id` потрапляє в кожен лог-рядок через `AsyncLocalStorage`, створення тикетів
  ідемпотентне, БД-операції з ретраями; плюс два ADR.

## Scope

- **In scope:** роути, сервіси, репозиторії; SQL-схема й транзакції; плагіни `db` (fail-fast), `error-handler`,
  `request-context`; `core/errors.ts`, `core/context.ts`, `core/ids.ts`; `db/retry.ts`, `db/transaction.ts`;
  ADR-0002 і ADR-0003; тести бізнес-логіки.
- **Allowed write paths:** `src/modules/**`, `src/plugins/**`, `src/core/**`, `src/db/**`, `src/config/**`,
  `src/app.ts`, `src/index.ts`, `test/**`, `docs/specs/spec-02.md`, `docs/decisions/0002-*.md`,
  `docs/decisions/0003-*.md`, `docs/er-diagram.md` (додати `idempotency_keys`), `README.md` (розділ «Поточний
  стан»), `package.json` і `package-lock.json` (лише `sql-template-tag@^5.2.1`).
- **Read-only context:** `standards/**`, `docs/specs/spec-01.md`, `docs/decisions/0001-use-node-sqlite.md`,
  `dist/**`, `node_modules/**`.

## Technical Implementation (Адаптивний розділ)

> _Цей розділ змінюється залежно від завдання._

**1. Шари — жорсткі межі** (порушення = блокуючий коментар рев'ю):

- **HTTP** (`modules/*/index.ts`, `*.routes.ts`, `*.schema.ts`): JSON-схеми, мапінг DTO → домен, виклик сервісу,
  статус-код. Заборонено: SQL, транзакції, бізнес-правила.
- **Бізнес-логіка** (`*.service.ts`): переходи статусів, перевірка ролей, рішення про replay, складання агрегатів.
  Заборонено: SQL, `sql-template-tag`, `node:sqlite`, `req`/`reply`, HTTP-коди.
- **Дані / DAO** (`*.repository.ts`, `src/db/**`): сирий SQL через `sql-template-tag`, транзакції, retry, мапінг
  rows → домен. Заборонено: бізнес-правила, Fastify, HTTP.

- SQL — **виключно** у `src/db/**` і `src/modules/*/*.repository.ts`; у роутах писати SQL заборонено. Перевірка:
  `grep` на `sql-template-tag` / `node:sqlite` по `src/modules/*/*.routes.ts`, `*.service.ts`, `src/plugins/**`.
- SQL будується лише через `sql`-тег; конкатенація рядків і `raw()` з даними запиту заборонені, динамічні
  ідентифікатори (`ORDER BY`, назви колонок) — лише з whitelist (ADR-0003).
- Роут ≤ 20 рядків: `schema` → `service` → `reply.code(...)`; бізнес-умов у роутах немає.
- Один виклик репозиторію = максимум одна транзакція; сервіс транзакцій не відкриває.

**2. Порти й два драйвери.** `users.repository.ts` / `tickets.repository.ts` описують інтерфейси (`UsersRepository`,
`TicketsRepository`); реалізації — `*.memory.repository.ts` (`Map` + лічильник з `core/ids.ts`, без транзакцій) і
`*.sqlite.repository.ts`. Сервіси залежать лише від інтерфейсу, вибір — один раз у `src/app.ts` (composition root)
за `DB_DRIVER=memory|sqlite` (типово `sqlite`) з `src/config/env.ts` (`DB_DRIVER`, `DB_PATH`, `PORT`, `HOST`,
`LOG_LEVEL`). Один набір тестів проходить на обох драйверах — це і є «спочатку статика, потім БД».

**3. SQL-схема** (`src/db/schema.sql`, ідемпотентно — `CREATE TABLE IF NOT EXISTS`, без міграційного фреймворку;
повна діаграма — `docs/er-diagram.md`):

- `users(id INTEGER PK, email UNIQUE, password_hash, display_name, role, created_at, updated_at)`;
- `tickets(id INTEGER PK, title, description?, status, priority, reporter_id→users RESTRICT, assignee_id→users?
RESTRICT, created_at, updated_at)`;
- `ticket_comments(id INTEGER PK, ticket_id→tickets CASCADE, author_id→users RESTRICT, body, created_at)`;
- `idempotency_keys(key, user_id→users, method, path, request_hash, status_code, response_json, created_at)`,
  `PRIMARY KEY (key, user_id)` — єдине розширення ER проти spec-01;
- CHECK-и ролей/статусів/пріоритетів — як у spec-01; індекси `tickets(status)`, `tickets(assignee_id)`,
  `ticket_comments(ticket_id)`; PRAGMA при відкритті: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout`;
- кожен сценарій запису — одна транзакція `BEGIN IMMEDIATE … COMMIT/ROLLBACK` у `src/db/transaction.ts`
  (`DatabaseSync`).

**4. Fail-fast на старті.** `plugins/db.ts`: відкрити `DB_PATH`, застосувати PRAGMA й `schema.sql`, виконати
`SELECT 1`; помилка пробрасується, `src/index.ts` логує `fatal` і робить `process.exit(1)` — сервер не слухає
порт. `app.ready()` у тестах теж падає, якщо БД недоступна. DDL лежить у `src/db/schema.sql`; `npm run build`
копіює його в `dist/db/`, інакше прод-збірка не знайде схему.

**5. Business-process id (`X-Request-Id`) через ALS.** `core/context.ts`: `AsyncLocalStorage<{ requestId, userId? }>`,
`runWithContext`, `getRequestId`. `src/app.ts` задає `genReqId`; `plugins/request-context.ts` в `onRequest` бере
`X-Request-Id` або генерує `randomUUID()`, викликає `als.run(store, done)` і віддає id клієнту тим самим заголовком.
`mixin: () => ({ requestId: getRequestId() })` додає id в кожен лог-рядок **без передачі параметрами**; сервіси й
репозиторії id не приймають. Поза запитом (старт, seed, юніт-тест сервісу) `getRequestId()` повертає `undefined`,
формат логів пише `-`. Через ALS передаються **лише** технічні поля (`requestId`, `userId`); залежності
(репозиторії, `db`, конфіг) — явно з composition root, не через контекст (рішення — ADR-0002).

**6. Помилки.**

- `core/errors.ts`: `AppError` (`code`, `statusCode`, `message`, `details?`) і нащадки — `ValidationError` 400,
  `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409 (невалідний перехід,
  дубль email, повторне використання ключа), `ServiceUnavailableError` 503 (БД зайнята після ретраїв).
- `plugins/error-handler.ts` — **один** `setErrorHandler` + `setNotFoundHandler`: формат
  `{ error: { code, message, details? }, requestId }`, 4xx → `warn`, 5xx → `error`, стектрейс назовні не виходить,
  невідома помилка → 500 `INTERNAL_ERROR`; `FST_ERR_VALIDATION` → 400 `VALIDATION_FAILED`, `SQLITE_CONSTRAINT_*` → 409.
- `try/catch` у `src/**` заборонений, окрім bootstrap (`src/index.ts`) і `src/db/attempt.ts` — єдиної точки, де
  помилка перехоплюється заради `ROLLBACK` і ретраю; інші `catch` — блокуючий коментар, доказ — `grep`.

**7. Ендпоінти** (актор — заголовок `X-User-Id`, без нього 401):

| Метод і шлях                                                      | Призначення                                    | Помилки       |
| ----------------------------------------------------------------- | ---------------------------------------------- | ------------- |
| `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id` | створення/читання, зміна `role`/`display_name` | 400, 404, 409 |
| `POST /tickets`                                                   | створення, `Idempotency-Key` обов'язковий      | 400, 401, 409 |
| `GET /tickets`, `GET /tickets/:id`                                | список/деталі з авторами                       | 400, 404      |
| `PATCH /tickets/:id/status`                                       | `new → in_progress → resolved`, reopen         | 401, 404, 409 |
| `PATCH /tickets/:id/assignee`                                     | лише `agent`                                   | 401, 403, 404 |
| `GET`, `POST /tickets/:id/comments`                               | коментарі (без редагування)                    | 400, 401, 404 |

**8. Ідемпотентність створення тикетів.** Ключ — `Idempotency-Key` (UUID) у скоупі `(key, user_id)`;
`request_hash` = sha256 канонічного JSON тіла. Запис ключа і створення тикета — **одна транзакція**. Повтор із тим
самим hash → збережена відповідь зі статусом 201 + заголовок `Idempotency-Replayed: true`; інший hash → 409
`IDEMPOTENCY_KEY_REUSED`; без ключа → 400; конкурентний дубль ловиться UNIQUE-констрейнтом. Рішення про replay — у
сервісі, читання/запис ключа — лише в репозиторії.

**9. Ретраї.** `src/db/retry.ts` — власний декоратор `withRetry(fn, { attempts: 3, backoffMs })`, **синхронний**:
повторює **тільки** `SQLITE_BUSY`/`SQLITE_LOCKED`, інші помилки одразу назовні; обгортає **цілу транзакцію** в
sqlite-репозиторіях, не окремі statement'и і не неідемпотентні операції поза транзакцією; після 3-ї невдачі →
`ServiceUnavailableError` 503. Пауза між спробами — `Atomics.wait` (доступ до `node:sqlite` і так синхронний).
Асинхронну гілку (`overload` для `() => Promise<T>`, пауза через `setTimeout`) **свідомо відкладено**: усі
репозиторії синхронні, а `Atomics.wait` в async-коді блокував би event loop. Повернемося до неї, коли з'явиться
async-драйвер БД або зовнішній виклик усередині сценарію.

**10. Відсутність N+1.** `GET /tickets` — рівно **2 запити**: `tickets JOIN users AS reporter … LEFT JOIN users
AS assignee …` + `ticket_comments WHERE ticket_id IN (…)` (групування в сервісі); `GET /tickets/:id` — 2 запити.
JOIN до `ticket_comments` у списку заборонений (дублікати рядків); запит у циклі по тикетах заборонений.

**11. ADR.** MADR 4.0.0: `docs/decisions/0002-async-local-storage-for-request-context.md` (request-scoped контекст
через `AsyncLocalStorage` проти передачі параметрами, child-логера й DI-контейнера) і
`docs/decisions/0003-raw-sql-with-sql-template-tag.md` (сирий SQL + `sql-template-tag` проти ORM/query builder;
окремо обґрунтувати нову залежність з огляду на ADR-0001).

## Non-goals

- **Explicitly excluded:** JWT і хешування пароля, RBAC-гарди, видалення користувачів/тикетів, редагування
  коментарів, пошук і пагінація, історія подій, міграційний фреймворк, seed для продакшену, кеш, метрики,
  трейсинг, пул з'єднань, retry на інші класи помилок, async-варіант `withRetry` (sync-репозиторії цього не
  потребують), зміна `standards/**` і скриптів `package.json`.
- **Dependencies or contracts that must not change:** модель зі spec-01 (крім `idempotency_keys`), семантика
  статусів, `X-User-Id` як актор, `INTEGER PRIMARY KEY`, `node:sqlite` як драйвер, цілі `Makefile`, формат ADR.

## Acceptance Criteria

- [x] AC-1: `POST /users`, `GET /users`, `GET /users/:id`, `PATCH /users/:id`, `POST /tickets`, `GET /tickets`,
      `GET /tickets/:id`, `PATCH /tickets/:id/status`, `PATCH /tickets/:id/assignee`, `GET` і `POST` коментарів
      працюють end-to-end спочатку на `DB_DRIVER=memory`, а потім на `DB_DRIVER=sqlite`.
- [x] AC-2: шари розділені: у `*.routes.ts` і `*.service.ts` немає SQL, `sql-template-tag` і `node:sqlite`; SQL
      лише в `*.repository.ts` / `src/db/**`; `raw()` — 0 входжень у коді (лише згадка в коментарі `db/sql.ts`);
      `grep`-доказ у Evidence.
- [x] AC-3: невалідний перехід статусу → 409, призначення не-`agent` → 403, дубль email → 409, невідомий id → 404.
- [x] AC-4: працює **один** глобальний обробник: єдиний формат помилки, стектрейс не виходить, `try/catch` у
      `src/**` є лише в `src/index.ts` (bootstrap) і `src/db/attempt.ts` — `grep`-доказ у Evidence.
- [x] AC-5: `X-Request-Id` приймається або генерується в `onRequest`, кладеться в `AsyncLocalStorage`, логується в
      кожному рядку запиту (стандартні request-логи Fastify вимкнені й пишуться вручну всередині `als.run`) і
      повертається клієнту тим самим заголовком — без передачі через параметри; поза запитом (старт, seed) у логах
      `requestId: '-'`, без помилки.
- [x] AC-6: fail-fast: при недоступній БД сервер не стартує (`exit 1`, `fatal` у логах), порт не слухається.
- [x] AC-7: N+1 відсутній: `GET /tickets` виконує рівно 2 SQL-запити незалежно від кількості тикетів.
- [x] AC-8: ідемпотентність: повторний `POST /tickets` з тим самим ключем і тілом → та сама задача, статус 201,
      `Idempotency-Replayed: true`; інше тіло → 409; без ключа → 400.
- [x] AC-9: `withRetry` робить рівно 3 спроби лише на `SQLITE_BUSY`, після вичерпання → 503.
- [x] AC-10: транзакційність: збій на записі ключа ідемпотентності не лишає створеного тикета.
- [x] AC-11: ADR-0002 і ADR-0003 створені за MADR, зі `status`, `date`, альтернативами й `Consequences`.
- [x] AC-12: `make lint`, `make typecheck`, `make build`, `make smoke` — без помилок; нові тести зелені на обох
      драйверах.

## Evidence

- **Automated tests:** `test/users.test.ts`, `test/tickets.test.ts`, `test/ticket-status.test.ts`,
  `test/comments.test.ts`, `test/idempotency.test.ts`, `test/retry.test.ts`, `test/transaction.test.ts`,
  `test/context.test.ts`, `test/errors.test.ts`, `test/smoke.test.ts` (`node:test` + `app.inject()`, спільні фабрики —
  `test/helpers.ts`). Запуск: `npm run smoke` (70 тестів: 69 pass, 1 skip — SQL-лічильник лише для `sqlite`).
  Сценарії users/tickets/status/comments/idempotency виконуються двічі: `DB_DRIVER=memory` і `sqlite` (`:memory:`).
- **Manual checks:** `DB_PATH=./missing/dir/db.sqlite npx tsx src/index.ts` → `fatal: unable to open database file`,
  `exit 1`; `grep` по `src/**` для `sql-template-tag`/`node:sqlite` (лише `src/db/**`) і `try {` (лише `src/index.ts`,
  `src/db/attempt.ts`); `node dist/index.js` після `npm run build` — `/health` і `POST /users` відповідають (схема
  скопійована в `dist/db/`).
- **Logs, screenshots, metrics:** для запиту `GET /users/999` з `X-Request-Id: trace-abc-123` усі три рядки
  (`incoming request`, `request failed`, `request completed`) містять `requestId: trace-abc-123`; лічильник
  `dbClient.queryCount()` показує +2 на `GET /tickets`; повторний `POST /tickets` повертає `Idempotency-Replayed:
true`.

## Open Questions

- _Відкритих питань немає._ Вирішено під час планування: `idempotency_keys` — таблиця в SQLite; повторний запит
  повертає збережену відповідь зі статусом 201 і `Idempotency-Replayed: true`; ключ обов'язковий; business-process
  id — заголовок `X-Request-Id` або `randomUUID()`, повертається клієнту; статус і виконавець — окремі `PATCH`-роути;
  обидва драйвери лишаються в коді. Деталі — в ADR-0002 і ADR-0003.

> If this spec conflicts with a prompt, this spec wins.
