#!/usr/bin/env python3
"""
migrate.py — SQLite migration runner for personal-expense-tracker.

Usage
-----
  Local (from repo root):
    python backend/migrations/migrate.py

  Docker:
    docker compose run --rm migrate

  Specify a custom DB path:
    DATABASE_URL=sqlite:////data/expense.db python backend/migrations/migrate.py

Idempotency
-----------
Each migration version is recorded in a `schema_migrations` table.
A migration is skipped when its version row already exists, so this
script is safe to run multiple times (e.g. on every container start).

Adding new migrations
---------------------
1. Create  backend/migrations/vN_to_vN+1.sql  with the SQL statements.
2. Add an entry to the MIGRATIONS list below.
"""

import os
import sqlite3
import sys
from pathlib import Path

# ── Migration registry ────────────────────────────────────────────────────────
# Each entry: (version_key, sql_file_relative_to_this_script_dir)
MIGRATIONS: list[tuple[str, str]] = [
    ("v2", "v1_to_v2.sql"),
]

# ── Database path resolution ──────────────────────────────────────────────────


def resolve_db_path() -> Path:
    """
    Resolve the SQLite database file path.
    Priority:
      1. DATABASE_URL env var  (strips the sqlite:/// prefix)
      2. Default: <repo_root>/backend/expense.db
    """
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url:
        # strip sqlite:/// or sqlite:////
        path_str = db_url.replace("sqlite:////", "/").replace("sqlite:///", "")
        return Path(path_str)
    # default: two levels up from this script → repo root → backend/expense.db
    return Path(__file__).parent.parent / "expense.db"


# ── Migration executor ────────────────────────────────────────────────────────


def ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    TEXT NOT NULL PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    conn.commit()


def is_applied(conn: sqlite3.Connection, version: str) -> bool:
    row = conn.execute("SELECT 1 FROM schema_migrations WHERE version = ?", (version,)).fetchone()
    return row is not None


def apply_migration(conn: sqlite3.Connection, version: str, sql_path: Path) -> None:
    """
    Execute the SQL migration file inside a transaction with foreign keys OFF.
    The SQL file must end with:
        INSERT OR IGNORE INTO schema_migrations (version) VALUES ('<version>');
    so the version row is recorded atomically with the schema changes.
    """
    sql = sql_path.read_text(encoding="utf-8")

    # Strip the CREATE TABLE schema_migrations block from the SQL since we've
    # already ensured it exists.  Run the rest in a single transaction.
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.executescript(sql)  # executescript commits its own transaction
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()


def run_migrations(db_path: Path) -> None:
    migrations_dir = Path(__file__).parent

    if not db_path.exists():
        print(f"[migrate] ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[migrate] Target database: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    try:
        ensure_migrations_table(conn)

        for version, sql_filename in MIGRATIONS:
            if is_applied(conn, version):
                print(f"[migrate] {version}: already applied — skipping")
                continue

            sql_path = migrations_dir / sql_filename
            if not sql_path.exists():
                print(
                    f"[migrate] ERROR: SQL file not found: {sql_path}",
                    file=sys.stderr,
                )
                sys.exit(1)

            print(f"[migrate] {version}: applying {sql_filename} …", end=" ", flush=True)
            try:
                apply_migration(conn, version, sql_path)
            except sqlite3.Error as exc:
                print(f"FAILED\n[migrate] ERROR: {exc}", file=sys.stderr)
                sys.exit(1)

            if is_applied(conn, version):
                print("done ✓")
            else:
                print(
                    f"FAILED — version row not found after applying {sql_filename}",
                    file=sys.stderr,
                )
                sys.exit(1)

        print("[migrate] All migrations applied.")
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations(resolve_db_path())
