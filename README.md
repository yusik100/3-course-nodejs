# Task Tracker API

Спрощена версія системи трекінгу задач (аналог Jira), розроблена як модульний моноліт. Проєкт дозволяє клієнтам створювати заявки, а агентам - брати їх у роботу та комунікувати через коментарі.

## Поточний стан

Реалізовано робочий API (ітерація 2, [`docs/specs/spec-02.md`](docs/specs/spec-02.md)): користувачі, тикети, зміна
статусів, призначення виконавця й коментарі. Той самий код працює на двох драйверах — `memory` (прототип без БД) і
`sqlite` (вбудований `node:sqlite`, типово). Шари розділені: роути → сервіси → репозиторії; SQL-запити живуть лише в
репозиторіях, а DDL і health-check (`SELECT 1`) — у `src/db/`. Є один глобальний обробник помилок, наскрізний
`X-Request-Id` через `AsyncLocalStorage`, ідемпотентне створення тикетів (`Idempotency-Key`) і ретраї на зайняту БД.
JWT, хешування пароля й RBAC — наступні ітерації.

Рішення зафіксовані в ADR: [`0001-use-node-sqlite`](docs/decisions/0001-use-node-sqlite.md),
[`0002-async-local-storage-for-request-context`](docs/decisions/0002-async-local-storage-for-request-context.md),
[`0003-raw-sql-with-sql-template-tag`](docs/decisions/0003-raw-sql-with-sql-template-tag.md).

## Ендпоінти

`X-User-Id: <id>` обовʼязковий для `POST /tickets`, `PATCH /tickets/:id/status`, `PATCH /tickets/:id/assignee` і
`POST /tickets/:id/comments`; решта ендпоінтів працює без нього. Для `POST /tickets` додатково обовʼязковий
`Idempotency-Key` (UUID).

| Метод і шлях                        | Призначення                                 |
| ----------------------------------- | ------------------------------------------- |
| `GET /health`                       | стан застосунку й активний драйвер          |
| `POST /users`                       | створити користувача                        |
| `GET /users`, `GET /users/:id`      | список / один користувач                    |
| `PATCH /users/:id`                  | змінити `role` та/або `displayName`         |
| `POST /tickets`                     | створити тикет (`Idempotency-Key`)          |
| `GET /tickets`                      | список із авторами й лічильником коментарів |
| `GET /tickets/:id`                  | деталі тикета разом із коментарями          |
| `PATCH /tickets/:id/status`         | `new → in_progress → resolved`, reopen      |
| `PATCH /tickets/:id/assignee`       | призначити/зняти виконавця (лише `agent`)   |
| `GET`, `POST /tickets/:id/comments` | коментарі до тикета                         |

### Формат помилок

Усі помилки мають однаковий конверт; стектрейс назовні не віддається:

```json
{
  "error": { "code": "NOT_FOUND", "message": "Ticket 42 not found", "details": { "id": 42 } },
  "requestId": "3f0c9a52-…"
}
```

`details` — опційне поле, `requestId` дублює заголовок `X-Request-Id`.

| HTTP | `code`                                                                                        |
| ---- | --------------------------------------------------------------------------------------------- |
| 400  | `VALIDATION_FAILED`                                                                           |
| 401  | `UNAUTHORIZED`                                                                                |
| 403  | `FORBIDDEN`                                                                                   |
| 404  | `NOT_FOUND`                                                                                   |
| 409  | `EMAIL_TAKEN`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_STATUS_TRANSITION`, `ASSIGNEE_NOT_AGENT`    |
| 500  | `INTERNAL_ERROR`                                                                              |
| 503  | `DB_UNAVAILABLE`                                                                              |

Повтор `POST /tickets` із тим самим ключем і тим самим тілом повертає збережену відповідь зі статусом 201 і
заголовком `Idempotency-Replayed: true`; той самий ключ з іншим тілом — 409 `IDEMPOTENCY_KEY_REUSED`.

Відоме обмеження: для помилок розбору тіла або типу вмісту (Fastify `FST_ERR_CTP_*` — битий JSON, порожнє тіло,
невірний `content-type`) у полі `code` приходить фреймворковий код, а не `VALIDATION_FAILED`; нормалізацію
заплановано окремою зміною.

## Змінні середовища

| Змінна      | Типово              | Опис                                            |
| ----------- | ------------------- | ----------------------------------------------- |
| `PORT`      | `3000`              | порт HTTP-сервера                               |
| `HOST`      | `0.0.0.0`           | хост HTTP-сервера                               |
| `DB_DRIVER` | `sqlite`            | `sqlite` або `memory`                           |
| `DB_PATH`   | `./task-tracker.db` | шлях до файлу SQLite (для `memory` ігнорується) |
| `LOG_LEVEL` | `info`              | рівень логів pino                               |

## Технологічний стек

- **Runtime:** Node.js 24+ (ESM) — `engines: ">=24.13.0"`
- **Фреймворк:** Fastify
- **Мова:** TypeScript
- **База даних:** SQLite через вбудований `node:sqlite` (у Node 24 — ще experimental, очікується `ExperimentalWarning`; див. ADR-0001, `docs/decisions/`)
- **SQL:** сирий SQL через `sql-template-tag` (0 транзитивних залежностей; ADR-0003)
- **Тести:** `node:test` + `app.inject()`, запуск через `tsx`
- **Інструменти якості коду:** ESLint (Flat Config), Prettier, Husky, lint-staged

## Як розпочати роботу

### Попередні вимоги

- [Node.js](https://nodejs.org/) версії 24.13.0 або вище (потрібен вбудований модуль `node:sqlite`).
- [GNU Make](https://www.gnu.org/software/make/) — необов'язково, лише для команд `make ...`.

### Встановлення та запуск

1. **Клонування репозиторію та встановлення залежностей:**

   ```bash
   git clone https://github.com/yusik100/3-course-nodejs.git
   cd 3-course-nodejs
   npm install   # або make install
   ```

2. **Запуск у режимі розробки (з гарячим перезавантаженням):**

   ```bash
   npm run dev
   ```

   Сервер запуститься за адресою http://localhost:3000, БД — файл `./task-tracker.db` (він у `.gitignore`).

3. **Збірка проєкту для продакшену:**

   ```bash
   npm run build   # або make build
   npm start
   ```

   `npm run build` компілює `src/` у `dist/` і **копіює `src/db/schema.sql` у `dist/db/`**: `tsc` не переносить
   нес-TS файли, а без схеми `npm start` не зможе ініціалізувати БД.

### Команди для якості коду

Git-хуки перевіряють код автоматично: перед комітом для змінених файлів запускаються ESLint і Prettier, перед
пушем — smoke-тест, перевірка типів і збірка. Ті самі перевірки можна запустити вручну: `npm run smoke`,
`npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check`, `npm run typecheck`
(або `make smoke`, `make lint`, `make format`, `make typecheck`).

`npm run smoke` проганяє **всі** тести (`node:test` + `app.inject()`): сценарії користувачів, тикетів, статусів,
коментарів, ідемпотентності, ретраїв і транзакцій. Більшість наборів виконується двічі — на `DB_DRIVER=memory` і на
`sqlite` (`:memory:`), тому один і той самий контракт перевіряється на обох драйверах.

### Швидкий сценарій через curl

```bash
npm run dev                                   # http://localhost:3000, DB_DRIVER=sqlite

# 1. Створюємо користувача. id беремо з відповіді: у прикладі нижче — свіжа БД, тому id=1.
curl -s -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"email":"ann@example.com","displayName":"Ann","password":"secret123"}'

# 2. Створюємо тикет від імені цього користувача; ключ ідемпотентності — будь-який UUID.
curl -s -X POST localhost:3000/tickets -H 'content-type: application/json' \
  -H 'x-user-id: 1' -H 'idempotency-key: 8f14e45f-ea9c-4b7a-9f1d-6a2b3c4d5e6f' \
  -d '{"title":"Broken printer"}'

# 3. Повтор того самого запиту: той самий тикет, статус 201 і Idempotency-Replayed: true.
curl -s -i -X POST localhost:3000/tickets -H 'content-type: application/json' \
  -H 'x-user-id: 1' -H 'idempotency-key: 8f14e45f-ea9c-4b7a-9f1d-6a2b3c4d5e6f' \
  -d '{"title":"Broken printer"}'

# 4. Список тикетів із авторами та лічильником коментарів.
curl -s localhost:3000/tickets
```
