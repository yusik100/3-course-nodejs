-- Схема БД Task Tracker API (spec-02, §3; діаграма — docs/er-diagram.md).
-- Застосовується ідемпотентно на старті (`CREATE TABLE IF NOT EXISTS`), без міграційного фреймворку.
-- Читається з `src/db/client.ts` (у збірці копіюється в `dist/db/schema.sql`).

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('client', 'agent', 'admin')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  description TEXT,
  status      TEXT NOT NULL CHECK (status IN ('new', 'in_progress', 'resolved')),
  priority    TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
  reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assignee_id INTEGER REFERENCES users (id) ON DELETE RESTRICT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id         INTEGER PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL
);

-- Ідемпотентність створення тикетів (spec-02, §8): ключ унікальний у скоупі користувача.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT NOT NULL,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  request_hash  TEXT NOT NULL,
  status_code   INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets (assignee_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments (ticket_id);
