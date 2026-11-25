-- =============================================================================
-- Migration: v1 → v2  |  personal-expense-tracker
-- Run via:  python backend/migrations/migrate.py
-- Or:       docker compose run --rm migrate
-- DO NOT run this file directly with sqlite3 — use migrate.py which
-- provides idempotency guards and proper error handling.
-- =============================================================================

-- Version tracking (created on first ever migration run)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT NOT NULL PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- v2: Add payment_method_id to fixed_expenses
-- (guard: only executed when version 'v2' is not yet recorded)
ALTER TABLE fixed_expenses
    ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id);

-- v2: Recreate expenses with fixed_expense_id as a plain INTEGER (no FK)
-- Step 1 of 4 – add column to old table so the copy SELECT is uniform
ALTER TABLE expenses ADD COLUMN fixed_expense_id INTEGER;

-- Step 2 of 4 – rename to staging table
ALTER TABLE expenses RENAME TO expenses_old;

-- Step 3 of 4 – create canonical v2 table (fixed_expense_id has NO REFERENCES)
CREATE TABLE expenses (
    id                INTEGER NOT NULL PRIMARY KEY,
    user_id           INTEGER NOT NULL,
    date              VARCHAR NOT NULL,
    description       VARCHAR NOT NULL,
    amount            FLOAT   NOT NULL,
    payment_method_id INTEGER NOT NULL,
    category_id       INTEGER NOT NULL,
    fixed_expense_id  INTEGER,
    created_at        VARCHAR,
    FOREIGN KEY(user_id)           REFERENCES users(id),
    FOREIGN KEY(payment_method_id) REFERENCES payment_methods(id),
    FOREIGN KEY(category_id)       REFERENCES categories(id)
);

-- Step 4 of 4 – copy data, recreate indexes, drop staging table
INSERT INTO expenses (id, user_id, date, description, amount,
                      payment_method_id, category_id, fixed_expense_id, created_at)
SELECT                id, user_id, date, description, amount,
                      payment_method_id, category_id, fixed_expense_id, created_at
FROM expenses_old;

CREATE INDEX IF NOT EXISTS ix_expenses_id   ON expenses (id);
CREATE INDEX IF NOT EXISTS ix_expenses_date ON expenses (date);

DROP TABLE expenses_old;

-- Record this migration as applied
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('v2');
