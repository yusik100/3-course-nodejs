# ER-діаграма: users, tickets, ticket_comments

Схема відповідає моделі даних зі [`specs/spec-01.md`](./specs/spec-01.md): три таблиці, а ролі та статуси —
текстові колонки з `CHECK`, без довідників і таблиць історії.

```mermaid
erDiagram
    USERS ||--o{ TICKETS : "reporter"
    USERS ||--o{ TICKETS : "assignee (nullable)"
    USERS ||--o{ TICKET_COMMENTS : "author"
    TICKETS ||--o{ TICKET_COMMENTS : "має"
    USERS ||--o{ IDEMPOTENCY_KEYS : "створює ключі"

    USERS {
        integer id PK
        text email UK "унікальний, у lower case"
        text password_hash
        text display_name
        text role "CHECK: client | agent | admin"
        text created_at
        text updated_at
    }

    TICKETS {
        integer id PK
        text title "3..200"
        text description "nullable"
        text status "CHECK: new | in_progress | resolved"
        text priority "CHECK: low | normal | high"
        integer reporter_id FK "users.id, RESTRICT"
        integer assignee_id FK "users.id, nullable, RESTRICT"
        text created_at
        text updated_at
    }

    TICKET_COMMENTS {
        integer id PK
        integer ticket_id FK "tickets.id, CASCADE"
        integer author_id FK "users.id, RESTRICT"
        text body "1..5000"
        text created_at
    }

    IDEMPOTENCY_KEYS {
        text key PK "у складі PK (key, user_id)"
        integer user_id PK "users.id, CASCADE"
        text method
        text path
        text request_hash "sha256 канонічного тіла"
        integer status_code
        text response_json
        text created_at
    }
```

## Примітки

- Зв'язок `users → tickets` задіяний двічі: `reporter_id` (обов'язковий) і `assignee_id` (опційний).
- `ticket_comments` видаляються каскадом разом із задачею; користувача, на якого є посилання, видалити не можна
  (`RESTRICT`).
- `idempotency_keys` додано в ітерації 2 (spec-02, §8) для ідемпотентного створення тикетів: складений ключ
  `(key, user_id)`, зберігається `request_hash` і серіалізована відповідь; ключ видаляється разом із користувачем
  (`CASCADE`).
- Тип `id` — `INTEGER PRIMARY KEY` у всіх таблицях (вирішено в spec-01, 2026-09-30; альтернативу UUID/TEXT
  відхилено).
- Драйвер — вбудований `node:sqlite` (`DatabaseSync`), Node ≥ 24 (ADR-0001); `INTEGER` ↔ JS `number`, для
  значень, що виходять за межі `Number.MAX_SAFE_INTEGER`, — `setReadBigInts` на рівні statement за потреби.
- Ролі та статуси зберігаються текстом (`users.role`, `tickets.status`, `tickets.priority`), обмеження —
  `CHECK`-констрейнт, а не окремі таблиці-довідники.
