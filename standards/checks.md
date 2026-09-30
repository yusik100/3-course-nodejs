# Перелік перевірок

Що, коли і якою командою перевіряємо. `make` — необов'язковий (потрібен GNU Make); для кожної цілі поруч є
npm-еквівалент.

## 1. Перед комітом — автоматично

`pre-commit` → `npx lint-staged`: `eslint --fix` і `prettier --write` лише для застейджених `*.ts` та `*.js`.

Прогнати вручну: `npx lint-staged` або `git hook run pre-commit`.

## 2. Перед пушем — автоматично

`pre-push` → `npm run smoke`, `npm run typecheck` і `npm run build` (не пушимо код, який падає на smoke-тесті,
не типізується або не збирається).

Прогнати вручну: `git hook run pre-push`.

## 3. Вручну перед завершенням ітерації

| Перевірка      | Команда                                             | Очікування                                          |
| -------------- | --------------------------------------------------- | --------------------------------------------------- |
| Лінт           | `make lint` / `npm run lint`                        | 0 помилок                                           |
| Форматування   | `make format-check` / `npm run format:check`        | `All matched files use Prettier...`                 |
| Типи           | `make typecheck` / `npm run typecheck`              | без виводу, код виходу 0                            |
| Збірка         | `make build` / `npm run build`                      | створено `dist/index.js` (без тестів)               |
| Smoke-тест     | `make smoke` / `npm run smoke`                      | `pass 1`, `fail 0`                                  |
| Запуск         | `npm run dev` + `curl http://localhost:3000/health` | `{"status":"ok",...}`                               |
| Чисте оточення | `npm ci` на свіжому клоні                           | встановлення без помилок, husky активний            |
| Вміст коміту   | `git status`                                        | немає `node_modules/`, `dist/`, `.env`, `.husky/_/` |

## 4. Періодично

- `npm outdated` — оновлення в межах semver, окремою гілкою.
- `npm audit` — вразливості залежностей.
- `node --version` — не нижче 24.13 (див. `engines` у `package.json`).
- `node -p "typeof require('node:sqlite').DatabaseSync"` — має відповісти `function` (драйвер БД на місці, див.
  ADR-0001).
- Ревізія `TODO`, чернеток у `docs/` і відкритих `Open Questions` у спеках.

## Якщо перевірка впала

1. Дочитати повідомлення до кінця (ESLint указує файл, рядок і правило).
2. Спробувати автовиправлення: `make lint-fix`, `make format`.
3. Не обходити хук через `git commit --no-verify`; якщо обхід справді потрібен — причина в описі коміта.
4. `HUSKY=0 git commit ...` — тільки в надзвичайному випадку (напр., аварійна правка самого хука).
5. Після виправлення прогнати мінімум таблицю з розділу 3.
