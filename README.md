# Task Tracker API

Спрощена версія системи трекінгу задач (аналог Jira), розроблена як модульний моноліт. Проєкт дозволяє клієнтам створювати заявки, а агентам - брати їх у роботу та комунікувати через коментарі.

## Поточний стан

Реалізовано робочий API (ітерація 2, [`docs/specs/spec-02.md`](docs/specs/spec-02.md)): користувачі, тикети, зміна
статусів, призначення виконавця й коментарі. Той самий код працює на двох драйверах — `memory` (прототип без БД) і
`sqlite` (вбудований `node:sqlite`, типово). Шари розділені: роути → сервіси → репозиторії; SQL живе лише в
репозиторіях. Є один глобальний обробник помилок, наскрізний `X-Request-Id` через `AsyncLocalStorage`,
ідемпотентне створення тикетів (`Idempotency-Key`) і ретраї на зайняту БД. JWT, хешування пароля й RBAC — наступні
ітерації.

Рішення зафіксовані в ADR: [`0001-use-node-sqlite`](docs/decisions/0001-use-node-sqlite.md),
[`0002-async-local-storage-for-request-context`](docs/decisions/0002-async-local-storage-for-request-context.md),
[`0003-raw-sql-with-sql-template-tag`](docs/decisions/0003-raw-sql-with-sql-template-tag.md).

## Ендпоінти

Актор запиту — заголовок `X-User-Id: <id>`; для `POST /tickets` обовʼязковий `Idempotency-Key`.

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

   Сервер запуститься за адресою http://localhost:3000.

3. **Збірка проєкту для продакшену:**

   ```bash
   npm run build   # або make build
   npm start
   ```

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
curl -s -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"email":"ann@example.com","displayName":"Ann","password":"secret123"}'
curl -s -X POST localhost:3000/tickets -H 'content-type: application/json' \
  -H 'x-user-id: 1' -H 'idempotency-key: 4b1f…' -d '{"title":"Broken printer"}'
curl -s localhost:3000/tickets
```
