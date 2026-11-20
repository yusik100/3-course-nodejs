# Spec 03: тестова піраміда, покриття гілок і мутаційне тестування

Ітерація 3 · Статус: draft · 2026-11-20 · Шаблон: standards/spec-format.md

## Context

- **Problem:** тести вже є (74 тести, 1 skip), але вони переважно integration-рівня через `app.inject()`; немає
  ізольованих unit-тестів сервісів, реального файлового SQLite, справжнього e2e з HTTP-сервером, покриття гілок і
  мутаційного тестування. Частина бізнес-гілок залишається зеленою, навіть якщо поведінка зламана.
- **Current behavior:** `test/` плоский; `npm run smoke` запускає всі тести; `pre-push` — smoke, typecheck, build;
  `Makefile` не має цілей `test`, `coverage`, `mutation`; тести `comments.test.ts` залежать від порядку виконання.
- **Users or systems affected:** автор, рев'юер, майбутні зміни в `src/**` — тести мають ловити регресії швидко й
  повторювано.

## Goal

- **The smallest useful outcome:** триярусна стратегія `unit → integration → e2e`, спільні тестові хелпери в
  `test/support/`, реальний файловий SQLite у тимчасовій теці, реальний HTTP-сервер на `port: 0`, звіт покриття
  гілок і звіт Stryker; `make test` чисто проходить двічі поспіль.

## Scope

- **In scope:** перенесення наявних тестів у `unit/`, `integration/`, `e2e/`; `test/support/`; нові unit-тести
  `tickets.service.ts`, `retry.ts`, `actor.ts` і невеликої частини `context.ts`; integration-тести репозиторіїв і
  `src/db/**` на реальному файлі SQLite; e2e-сценарій із реальним сервером і `fetch()`; команди `test`, `coverage`,
  `mutation`; класифікація вижилих мутантів і аудит топ-3 слабких «зелених» тестів із підсиленням; оновлення
  `pre-push`, README і `standards/checks.md`.
- **Allowed write paths:** `test/**`, `docs/specs/spec-03.md`, `package.json`, `package-lock.json`, `Makefile`,
  `stryker.config.json`, `.gitignore`, `.husky/pre-push`, `README.md`, `standards/checks.md`.
- **Read-only context:** `src/**`, `standards/spec-format.md`, `standards/definition-of-done.md`,
  `docs/specs/spec-01.md`, `docs/specs/spec-02.md`, `docs/decisions/**`.

## Technical Implementation (Адаптивний розділ)

**1. Структура тестів і спільні хелпери.**

- `unit/` — `tickets.service.test.ts`, `retry.test.ts`, `actor.test.ts`, `context.test.ts`.
- `integration/` — перенесені HTTP-тести (`users`, `tickets`, `ticket-status`, `comments`, `idempotency`, `errors`,
  `smoke`, `logging`) + `db.transaction.test.ts` (перенесений і розширений) та нові `users.repository.test.ts`,
  `tickets.repository.test.ts`, `db.integrity.test.ts`.
- `e2e/` — `api.e2e.test.ts`.
- `support/` — `helpers.ts`, `fakes.ts`, `temp-db.ts`, `server.ts`; файли не мають суфікса `.test.ts`.

Старі HTTP-тести переносяться в `integration/`; `retry.test.ts` — в `unit/`; `context.test.ts` ділиться на unit
(ALS, `getRequestId`, `getUserId`, `getLogger` fallback) і integration (`logging.test.ts`). `smoke.test.ts`
переноситься в `integration/`; `npm run smoke` запускає лише його. У `comments.test.ts` кожен тест створює власні
фікстури (`beforeEach`/локальний setup), залежність від порядку прибирається.

**2. Unit: без Fastify, SQLite і mock-фреймворків.** `tickets.service.ts` покривається по всіх гілках вручну
написаними фейками `TicketsRepository` і `UsersDirectory` (невикористані методи дублерів кидають помилку):
actor/ticket not found, key-reused, created, replayed,
порожній коментар, невалідний перехід, assign не-агентом, assignee not found/not agent, `undefined` після update,
`commentsCount` за замовчуванням. `retry.ts` — errcode 5/6, тексти `SQLITE_BUSY`/`SQLITE_LOCKED`, non-retryable,
кастомний `attempts`, вичерпання → `ServiceUnavailableError`. `actor.ts` — масив/рядок/порожнє/невалідне значення.
`context.ts` — fallback поза запитом і паралельні контексти. `users.service.ts`, `env.ts`, `ids.ts` не чіпаємо.

**3. Integration: реальний файл SQLite.** Кожен тестовий файл відкриває `openSqliteClient(dbPath)` у
`mkdtemp(join(tmpdir(), 'task-tracker-it-'))`; схема застосовується самим клієнтом. Перевіряємо `COMMIT`/`ROLLBACK`,
стан `idempotency_keys` після відкату, FK `RESTRICT`/`CASCADE`, CHECK для role/status/priority/title/body,
ідемпотентність (created/replayed/key-reused) і `queryCount()`. N+1: `GET /tickets` — ≤2 запити, для непорожнього
списку рівно 2; `GET /tickets/:id` — 2. Після тесту `client.close()` і
`fs.rm(tempDir, { recursive: true, force: true, maxRetries, retryDelay })`, щоб не лишалися `-wal`/`-shm` на Windows.

**4. E2E: реальний HTTP.** `buildApp({ logger: false, config: { dbDriver: 'sqlite', dbPath } })` +
`listen({ port: 0, host: '127.0.0.1' })`; фактичний порт беремо з `app.server.address()`, запити — через `fetch()`.
Сценарій: створити user → ticket з `Idempotency-Key` → replay → status → assign → comment → list/details. Окремо:
закрити app, підняти новий на тому самому `dbPath` і перевірити, що дані на місці (restart persistence). Після —
`app.close()` і видалення тимчасової теки; `port: 0` і унікальний `dbPath` забезпечують повторний запуск.

**5. Покриття.** Використовуємо вбудоване покриття Node 24, без `c8` і без порогів у команді:
`node --import tsx --test --experimental-test-coverage --test-coverage-include="src/**/*.ts" --test-coverage-exclude="src/index.ts" "test/**/*.test.ts"`.
`src/index.ts` виключений, бо він запускає сервер на імпорті; bootstrap через `spawn` — Non-goal. Дивимось звіт
line/branch/functions, рішення про покращення — за фактичними цифрами, не за штучним threshold.

**6. Stryker.** Додаємо `@stryker-mutator/core` (command runner вбудований). `stryker.config.json`:
`testRunner: "command"`, `commandRunner.command: "npm run test:unit"`, `mutate` — лише
`src/modules/tickets/tickets.service.ts`, `src/db/retry.ts`, `src/core/actor.ts`; `coverageAnalysis: "off"`,
`ignoreStatic: false`; `StringLiteral` не виключаємо — усіх вижилих мутантів класифікуємо (реальна прогалина /
еквівалентний / прийнятний), прогалини закриваємо тестами; `thresholds.break` не задаємо, щоб `make mutation`
завжди завершувався звітом. Reporters:
`clear-text`, `progress`, `html`; `.stryker-tmp/` і `reports/` — у `.gitignore`.

**7. Команди та хуки.** `package.json`: `smoke` — лише `test/integration/smoke.test.ts`; `test:unit`,
`test:integration`, `test:e2e` — відповідні globs; `test` — усі три послідовно; `coverage` — команда з п. 5;
`mutation` — `stryker run`. `Makefile`: цілі `test`, `coverage`, `mutation` з npm-еквівалентами, `help` і `.PHONY`.
`pre-push`: `npm run smoke` + `npm run test:unit` + `typecheck` + `build` (швидко); `standards/checks.md` і README
оновлюються відповідно.

## Non-goals

- **Explicitly excluded:** тести `users.service.ts`, `env.ts`, `ids.ts`; зміни в `src/**` (знайдені баги — окремо);
  `c8` і будь-які пороги покриття; CI; bootstrap через `spawn`; нові runtime-залежності; Jest/Vitest/Sinon та інші
  mock-фреймворки; мутація всього `src/**`; зміна API-контракту, схеми БД і форматів помилок.
- **Dependencies or contracts that must not change:** `node:test` + `tsx` як test runner; `openSqliteClient`,
  `schema.sql`, Fastify-роути, формат `X-Request-Id` і `AppError`; `src/**` read-only.

## Acceptance Criteria

- [x] AC-1: `test/` розділено на `unit/`, `integration/`, `e2e/`, `support/`; старі тести перенесені; `comments`
      не залежить від порядку; `npm run smoke` запускає лише smoke-тест.
- [x] AC-2: `npm run test:unit` не імпортує Fastify/SQLite і покриває всі гілки `tickets.service.ts`, а також
      ключові гілки `retry.ts`, `actor.ts`, `context.ts`; використані ручні фейки, без mock-бібліотек.
- [x] AC-3: integration-тести працюють на реальному файлі SQLite у тимчасовій теці, перевіряють commit/rollback,
      FK/CHECK, ідемпотентність і N+1 (≤2; для непорожнього списку рівно 2); після тестів не лишається файлів БД.
- [x] AC-4: e2e піднімає реальний HTTP-сервер на `port: 0`, ходить через `fetch()`, проходить повний сценарій і
      restart persistence; повторний запуск не залежить від попереднього стану чи порту.
- [x] AC-5: `npm run coverage` / `make coverage` формує звіт по гілках без порогів і без `src/index.ts`;
      `npm run mutation` / `make mutation` мутує рівно 3 файли, не падає через `break` і формує HTML-звіт;
      вижилі мутанти класифіковані на 3 класи, а топ-3 слабких «зелених» тестів підсилено.
- [x] AC-6: `npm test` / `make test` проходить **двічі поспіль** без залишкових БД, портів і тестових файлів;
      `pre-push` виконує smoke + unit + typecheck + build; `lint`, `typecheck`, `build`, `format-check` — без помилок.

## Evidence

- **Automated tests:** `npm test` двічі поспіль; `npm run smoke`; `npm run test:unit`, `test:integration`, `test:e2e`
  окремо; `npm run coverage` (таблиця line/branch/functions); `npm run mutation`
  (`reports/mutation/mutation.html`).
- **Manual checks:** перевірити дерево `test/`, відсутність `.only` і залежностей від порядку; окремо запустити
  `npx tsx --test test/integration/comments.test.ts`; переконатися, що `git status` не містить `*.db`,
  `-wal`, `-shm`, `reports/` або `.stryker-tmp/`.
- **Logs, screenshots, metrics:** вивід `npm test` (кількість pass/fail), branch coverage %, mutation score,
  класифікація вижилих мутантів (реальна прогалина / еквівалентний / прийнятний), аудит топ-3 підсилених тестів,
  HTML-звіт Stryker.

## Open Questions

- _Відкритих питань немає._ N+1 зафіксовано як ≤2 для порожнього списку і рівно 2 для непорожнього; якщо audit
  виявить реальний баг у `src/**`, він вирішується окремою ітерацією, бо `src/**` у цій spec — read-only.

> If this spec conflicts with a prompt, this spec wins.
