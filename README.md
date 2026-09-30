# Task Tracker API

Спрощена версія системи трекінгу задач (аналог Jira), розроблена як модульний моноліт. Проєкт дозволяє клієнтам створювати заявки, а агентам - брати їх у роботу та комунікувати через коментарі.

## Поточний стан

Наразі реалізовано каркас застосунку (Fastify + TypeScript, ESM) з єдиним ендпоінтом `GET /health`. Заявки, коментарі, автентифікація та база даних — у планах.

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
