# Personal Expense Tracker

A full-stack personal finance web application to track monthly expenses, visualize spending patterns, and manage financial data — replacing a manual Excel workflow.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Database Design](#database-design)
6. [API Design](#api-design)
7. [Frontend Pages & Components](#frontend-pages--components)
8. [Project Structure](#project-structure)
9. [Getting Started](#getting-started)
10. [Running with Docker](#running-with-docker)
11. [Environment Variables](#environment-variables)
12. [CI / CD](#ci--cd)
13. [Default Credentials](#default-credentials)

---

## Project Overview

This app replicates and enhances an Excel-based expense tracking workflow:

| Excel Sheet                  | Web App Equivalent                                        |
|------------------------------|-----------------------------------------------------------|
| Main expense records table   | Expenses page — add / edit / delete records               |
| Category summary table       | Dashboard — Spend by Category (bar chart)                 |
| Payment method summary table | Dashboard — Spend by Payment Method (bar chart)           |
| Monthly totals               | Dashboard — 6-Cycle Trend (line chart) + Category Pie     |

The app is **single-user**. JWT-based authentication protects all pages except the landing and login pages.

---

## Features

### Authentication
- Landing page with feature overview and login CTA
- Login accepts **email address or username** (display name)
- JWT session management — access token (30 min) + refresh token (7 days)
- Auto-refresh on 401: Axios interceptor transparently refreshes the token and replays the failed request
- Protected routes — unauthenticated users are redirected to `/login`
- Update profile (name, email) and change password from Settings

### Expense Management
- Add, edit, and delete expense records
- Fields: Date, Description, Amount, Payment Method, Category
- **MUI-style data table** (TanStack Table v8) — sortable columns, collapsible filter panel, rows-per-page selector, `1–N of total` pagination
- Filter by description (live search), category, and payment method
- **Billing cycle selector** at the top — defaults to the current cycle, can switch to any past cycle back to Jan 2026
- **Summary footer** — total record count and total amount for the active filter set (server-aggregated, not just the visible page)
- Auto-posted fixed expenses shown with a **"recurring"** badge

### Dashboard
- **Billing cycle selector** — switch between any billing cycle from Jan 2026 to present; all KPI cards and charts update instantly
- **KPI Cards** (colour-coded, reflect the selected cycle):
  - 🔴 Total Spent — red, with transaction count
  - 🔴 Avg. Per Day — red, over the selected billing cycle
  - 🔵 Monthly Salary — blue, with fixed expense subtotal
  - 🟢 Net Savings — green when positive, red when over budget
- **6-Cycle Spending Trend** — line chart of the past 6 billing cycles
- **Spend by Category** — horizontal bar chart for the selected cycle (includes auto-posted fixed expenses)
- **Spend by Payment Method** — horizontal bar chart for the selected cycle
- **Category Pie Chart** — proportional breakdown for the selected cycle

### Billing Cycle
- Configurable start day (1–28), defaulting to the **12th of every month**
- With `start_day=12`: the active cycle is `12 Nov → 11 Dec`; on the 12th of December it automatically rolls over to `12 Dec → 11 Jan`
- All dashboard charts and KPIs always reflect the **current billing cycle**, not the calendar month
- The 6-cycle trend chart walks back through past billing cycles (not calendar months)

### Theme
- **Dark / Light mode toggle** in the sidebar — preference persisted to `localStorage`
- Full CSS variable–based theme; all chart tooltips and grid lines adapt to the active theme

### Settings
- Manage Categories — add, rename, delete
- Manage Payment Methods — add, rename, delete
- Billing Cycle — set the start day (1–28)
- **Monthly Fixed Expenses** — recurring items (Rent, EMI, SIP, etc.); each template requires a **Category** and **Payment Method** to enable auto-posting
- Monthly Salary — used to compute Net Savings
- Profile — update name and email
- Security — change password

### Fixed Expense Auto-Posting
- When the Dashboard loads it calls `POST /dashboard/apply-fixed-expenses` for the current billing cycle
- This idempotently creates one `expenses` row per template, dated the **1st of the cycle's calendar month**
- The user can then edit each row's date to match the actual bank debit date
- The **"Apply Fixed Expenses"** button on the Expenses page lets you trigger the same action for any past billing cycle
- **Deduplication**: a template is never posted twice for the same billing cycle window, regardless of what date the user moves the row to
- **History isolation**: editing or deleting a fixed expense template never modifies previously-posted expense records — each posted row is a self-contained snapshot

---

## Tech Stack

| Layer        | Technology                                        |
|--------------|---------------------------------------------------|
| Frontend     | React 18, React Router v6, Vite 5                 |
| Styling      | Tailwind CSS v3 (CSS variable–based theming)      |
| Charts       | Recharts 2                                        |
| Table        | TanStack Table v8 (headless, sortable, filterable)|
| State/Data   | TanStack Query v5 + Zustand v5                    |
| Forms        | React Hook Form v7 + Zod v3                       |
| Backend      | Python 3.11+, FastAPI 0.111                       |
| Auth         | JWT via `python-jose`, bcrypt via `passlib`       |
| Database     | SQLite via SQLAlchemy 2 ORM                       |
| Migrations   | Custom Python runner (`migrations/migrate.py`)    |
| Linter (BE)  | Ruff 0.5                                          |
| Linter (FE)  | ESLint 9 + typescript-eslint                      |
| Tests (BE)   | pytest + pytest-cov + httpx TestClient            |
| Tests (FE)   | Vitest 2 + Testing Library                        |
| Container    | Docker (multi-stage), nginx 1.27, Compose v2      |
| CI           | GitHub Actions                                    |
| API Docs     | FastAPI auto-generated Swagger UI                 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React SPA)                       │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Landing /   │  │  Expenses    │  │Dashboard │  │Settings │ │
│  │  Login Page  │  │  Page        │  │  Page    │  │  Page   │ │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └────┬────┘ │
│         │                 │ (protected)    │ (protected)  │     │
│  ┌──────▼─────────────────▼───────────────▼──────────────▼───┐  │
│  │               React Router v6 + PrivateRoute              │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │      TanStack Query v5 (HTTP cache + mutations)              │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │      Axios client  ─── Bearer JWT (auto-refresh on 401) ───  │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────│────────────────────────────────────┘
                              │  REST / JSON
┌─────────────────────────────▼────────────────────────────────────┐
│                       FastAPI Backend                             │
│                                                                   │
│  /auth  ·  /expenses  ·  /dashboard  ·  /settings                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │          SQLAlchemy 2 ORM  +  Alembic Migrations            │  │
│  └───────────────────────────┬─────────────────────────────────┘  │
└───────────────────────────────│──────────────────────────────────┘
                                │
                      ┌─────────▼──────────┐
                      │   SQLite Database   │
                      │   expense.db        │
                      └─────────────────────┘
```

### Request flow (authenticated page)

```
User action
    ▼
React component
    ▼
TanStack Query (mutation / query)
    ▼
Axios ──► attaches JWT from Zustand store ──► FastAPI endpoint
                                                    ▼
                                          JWT HTTPBearer middleware
                                                    ▼
                                           Route handler + ORM
                                                    ▼
                                              SQLite (expense.db)
    ◄──────────────── JSON response ─────────────────┘
    ▼
TanStack Query cache update  →  React re-render
```

---

## Database Design

### `users`
| Column        | Type    | Notes                                   |
|---------------|---------|-----------------------------------------|
| id            | INTEGER | PK, autoincrement                       |
| name          | TEXT    | display name — also accepted at login   |
| email         | TEXT    | unique, used for login                  |
| password_hash | TEXT    | bcrypt hash                             |
| created_at    | TEXT    | ISO 8601                                |
| updated_at    | TEXT    | ISO 8601                                |

### `categories`
| Column  | Type    | Notes                      |
|---------|---------|----------------------------|
| id      | INTEGER | PK                         |
| user_id | INTEGER | FK → users                 |
| name    | TEXT    | unique per user            |

### `payment_methods`
| Column  | Type    | Notes                      |
|---------|---------|----------------------------|
| id      | INTEGER | PK                         |
| user_id | INTEGER | FK → users                 |
| name    | TEXT    | unique per user            |

### `expenses`
| Column            | Type    | Notes                                                           |
|-------------------|---------|-----------------------------------------------------------------|
| id                | INTEGER | PK                                                              |
| user_id           | INTEGER | FK → users                                                      |
| date              | TEXT    | YYYY-MM-DD                                                      |
| description       | TEXT    |                                                                 |
| amount            | REAL    | INR                                                             |
| payment_method_id | INTEGER | FK → payment_methods                                            |
| category_id       | INTEGER | FK → categories                                                 |
| fixed_expense_id  | INTEGER | **nullable, plain integer — NOT a FK** — dedup marker only; identifies which fixed-expense template sourced this row; NULL for manually-entered expenses |
| created_at        | TEXT    | ISO 8601                                                        |

### `user_settings`
| Column                  | Type    | Notes                               |
|-------------------------|---------|-------------------------------------|
| id                      | INTEGER | PK                                  |
| user_id                 | INTEGER | FK → users, unique                  |
| billing_cycle_start_day | INTEGER | 1–28, **default 12**                |
| monthly_salary          | REAL    | for Net Savings calculation         |

### `fixed_expenses`
| Column            | Type    | Notes                                                      |
|-------------------|---------|------------------------------------------------------------|
| id                | INTEGER | PK                                                         |
| user_id           | INTEGER | FK → users                                                 |
| description       | TEXT    | e.g., "Rent", "NPS"                                        |
| amount            | REAL    |                                                            |
| category_id       | INTEGER | FK → categories (nullable) — required for auto-posting     |
| payment_method_id | INTEGER | FK → payment_methods (nullable) — required for auto-posting|

### `schema_migrations`
| Column     | Type | Notes                                                 |
|------------|------|-------------------------------------------------------|
| version    | TEXT | PK — e.g. `"v2"`                                      |
| applied_at | TEXT | ISO 8601 datetime, set automatically on INSERT        |

---

## Database Migrations

Schema migrations are managed by a custom Python runner at [`backend/migrations/migrate.py`](backend/migrations/migrate.py).

### Migration files

| File | Description |
|---|---|
| `backend/migrations/v1_to_v2.sql` | Adds `fixed_expense_id` to `expenses` and `payment_method_id` to `fixed_expenses`; recreates `expenses` to ensure `fixed_expense_id` has no FK constraint |

### Running migrations

**Local development (after pulling new changes):**
```bash
cd backend
source venv/bin/activate
python migrations/migrate.py
```

**Docker (production):**
Migrations run automatically as the `migrate` service before the backend starts:
```bash
docker compose up --build   # migrate runs first, then backend
```

To run migrations manually against the production volume:
```bash
docker compose run --rm migrate
```

### How it works

1. `migrate.py` connects to the SQLite database (from `DATABASE_URL` env var or `backend/expense.db`)
2. Creates a `schema_migrations` table if it does not exist
3. Iterates the `MIGRATIONS` list in order; skips any version already recorded in `schema_migrations`
4. Runs the SQL file inside a transaction with `PRAGMA foreign_keys = OFF`
5. Verifies the version row was inserted; exits with code 1 on any error

### Adding a new migration

1. Create `backend/migrations/vN_to_vN+1.sql`
2. End the file with:  `INSERT OR IGNORE INTO schema_migrations (version) VALUES ('vN+1');`
3. Add an entry to the `MIGRATIONS` list in `migrate.py`:
   ```python
   MIGRATIONS = [
       ("v2", "v1_to_v2.sql"),
       ("v3", "v2_to_v3.sql"),   # ← new entry
   ]
   ```

---

## API Design

**Base URL:** `http://localhost:8000/api/v1`  
**Auth:** `Authorization: Bearer <access_token>` on all protected routes.  
**Interactive docs:** `http://localhost:8000/docs`

### Auth

| Method | Path               | Auth? | Description                                 |
|--------|--------------------|-------|---------------------------------------------|
| POST   | /auth/register     | No    | Register new user                           |
| POST   | /auth/login        | No    | Login with email **or username** + password |
| POST   | /auth/refresh      | No    | Exchange refresh token for new token pair   |
| GET    | /auth/me           | Yes   | Get current user profile                    |
| PUT    | /auth/me           | Yes   | Update name / email                         |
| PUT    | /auth/me/password  | Yes   | Change password                             |

### Expenses

| Method | Path              | Description                                            |
|--------|-------------------|--------------------------------------------------------|
| GET    | /expenses         | List (paginated). Query: `page`, `page_size`, `start_date`, `end_date`, `category_id`, `payment_method_id`, `description` |
| POST   | /expenses         | Create expense                                         |
| GET    | /expenses/{id}    | Get single expense                                     |
| PUT    | /expenses/{id}    | Update expense                                         |
| DELETE | /expenses/{id}    | Delete expense                                         |

**`GET /expenses` response includes:**
- `total_amount` — sum of **all matching records** (not just the current page), useful for showing totals in the footer

### Dashboard

All dashboard endpoints respect the user's `billing_cycle_start_day` setting.

| Method | Path                                | Description                                                                |
|--------|-------------------------------------|----------------------------------------------------------------------------|
| GET    | /dashboard/summary                  | KPIs. Optional query: `cycle_start`, `cycle_end` (defaults to current cycle) |
| GET    | /dashboard/monthly-trend            | Totals for past N billing cycles (default 6). Query: `months`              |
| GET    | /dashboard/category-breakdown       | Category totals. Query: `start_date`, `end_date`                           |
| GET    | /dashboard/payment-breakdown        | Payment method totals. Query: `start_date`, `end_date`                     |
| GET    | /dashboard/billing-cycles           | All billing cycles from Jan 2026 to present, most recent first             |
| GET    | /dashboard/fixed-expenses-status    | For a given `cycle_start`, returns `{total_eligible, applied_count, all_applied}` |
| POST   | /dashboard/apply-fixed-expenses     | Idempotently posts fixed expense templates as expense records for a billing cycle. Query: `cycle_start` |

**`/dashboard/summary` response fields:**

```json
{
  "current_month":     "2026-11",
  "cycle_start":       "2026-11-12",
  "cycle_end":         "2026-12-11",
  "total_spent":       12500.0,
  "transaction_count": 18,
  "avg_per_day":       416.67,
  "monthly_salary":    80000.0,
  "total_fixed":       25000.0,
  "savings":           42500.0,
  "yearly_savings":    85000.0
}
```

### Settings

| Method | Path                           | Description                     |
|--------|--------------------------------|---------------------------------|
| GET    | /settings                      | Get billing cycle day + salary  |
| PUT    | /settings                      | Update billing cycle day + salary |
| GET    | /settings/categories           | List categories                 |
| POST   | /settings/categories           | Add category                    |
| PUT    | /settings/categories/{id}      | Rename category                 |
| DELETE | /settings/categories/{id}      | Delete category                 |
| GET    | /settings/payment-methods      | List payment methods            |
| POST   | /settings/payment-methods      | Add payment method              |
| PUT    | /settings/payment-methods/{id} | Rename payment method           |
| DELETE | /settings/payment-methods/{id} | Delete payment method           |
| GET    | /settings/fixed-expenses       | List fixed expenses             |
| POST   | /settings/fixed-expenses       | Add fixed expense               |
| PUT    | /settings/fixed-expenses/{id}  | Update fixed expense            |
| DELETE | /settings/fixed-expenses/{id}  | Delete fixed expense            |

---

## Frontend Pages & Components

### Routes

| Route        | Component      | Auth Required |
|--------------|----------------|---------------|
| `/`          | `LandingPage`  | No            |
| `/login`     | `LoginPage`    | No            |
| `/dashboard` | `DashboardPage`| Yes           |
| `/expenses`  | `ExpensesPage` | Yes           |
| `/settings`  | `SettingsPage` | Yes           |

### Source layout

```
frontend/src/
├── api/
│   ├── client.ts           # Axios instance — JWT attach + auto-refresh interceptor
│   └── api.ts              # Typed API functions for all 4 routers
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx    # Sidebar + scrollable main area (Outlet)
│   │   ├── Sidebar.tsx     # Nav links + user info + dark/light toggle
│   │   └── PrivateRoute.tsx
│   └── ui/                 # Minimal headless component wrappers
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── select.tsx
│       └── badge.tsx
├── lib/
│   ├── utils.ts            # cn(), formatCurrency() (INR), formatDate()
│   └── validations/
│       └── schemas.ts      # All Zod schemas + inferred TypeScript types
├── pages/
│   ├── LandingPage.tsx
│   ├── LoginPage.tsx       # Email or username login
│   ├── DashboardPage.tsx   # Billing cycle badge, coloured KPI cards, charts
│   ├── ExpensesPage.tsx    # Paginated table + add/edit modal
│   └── SettingsPage.tsx    # All 6 settings sections
├── store/
│   ├── authStore.ts        # Zustand (persisted) — user, tokens
│   └── themeStore.ts       # Zustand (persisted) — light/dark, applies class to <html>
└── test/
    ├── setup.ts
    └── utils.test.ts
```

---

## Project Structure

```
personal-expense-tracker/
├── README.md
├── AGENTS.md                       # AI agent guidance for this codebase
├── docker-compose.yml              # One-command local stack
├── .github/
│   └── workflows/
│       ├── backend-ci.yml          # Lint → Test (3.11+3.12 matrix) → Docker build
│       └── frontend-ci.yml         # Lint+typecheck → Test → Build → Docker build
├── backend/
│   ├── Dockerfile                  # Multi-stage Python 3.11-slim
│   ├── .dockerignore
│   ├── requirements.txt            # Includes pytest, ruff, httpx
│   ├── ruff.toml                   # Ruff lint + isort config
│   ├── pytest.ini
│   ├── alembic.ini
│   ├── seed_admin.py               # Creates admin/admin user (idempotent)
│   ├── alembic/
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS (env-configurable)
│   │   ├── config.py               # Pydantic Settings from .env
│   │   ├── database.py             # SQLAlchemy engine + get_db
│   │   ├── dependencies.py         # JWT helpers + get_current_user
│   │   ├── models/
│   │   │   └── models.py           # 6 ORM models
│   │   ├── schemas/
│   │   │   └── schemas.py          # All Pydantic request/response models
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── expenses.py
│   │       ├── dashboard.py        # Billing-cycle-aware aggregations
│   │       └── settings.py
│   └── tests/
│       ├── conftest.py             # In-memory SQLite fixtures
│       ├── test_auth.py
│       ├── test_expenses.py
│       └── test_settings.py
└── frontend/
    ├── Dockerfile                  # Multi-stage Node 20 → nginx 1.27
    ├── .dockerignore
    ├── nginx.conf                  # SPA fallback + /api/ proxy to backend
    ├── package.json
    ├── vite.config.ts              # Vitest + path alias @/
    ├── tailwind.config.ts          # CSS variable–based theme tokens
    ├── tsconfig.json
    └── src/                        # (see Source layout above)
```

---

## Getting Started

### Prerequisites
- **Node.js 20+**
- **Python 3.11+**
- `pip` and `venv`

### 1 — Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start the API server (tables are auto-created on first run)
uvicorn app.main:app --reload --port 8000

# (First time only) seed the admin user
python seed_admin.py
```

Swagger UI: **http://localhost:8000/docs**

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

### Useful dev commands

| Command | Directory | Purpose |
|---|---|---|
| `python migrations/migrate.py` | `backend/` | **Run schema migrations** (do this after pulling schema changes) |
| `uvicorn app.main:app --reload --port 9000` | `backend/` | Start API with hot-reload (use port 9000 if Docker is on 8000) |
| `python seed_admin.py` | `backend/` | Create / verify admin user |
| `SECRET_KEY=x DATABASE_URL=sqlite:///:memory: pytest tests/ -v` | `backend/` | Run all backend tests |
| `ruff check . && ruff format --check .` | `backend/` | Lint + format check |
| `ruff format .` | `backend/` | Auto-format |
| `npm run dev` | `frontend/` | Vite dev server on :5173 |
| `npm test` | `frontend/` | Vitest unit tests |
| `npm run lint:ci` | `frontend/` | ESLint (zero warnings) |
| `npm run type-check` | `frontend/` | TypeScript type check |
| `npm run build` | `frontend/` | Production bundle |

---

## Running with Docker

A single command builds and starts all services:

```bash
# Copy and customise env
cp backend/.env.example backend/.env   # set SECRET_KEY

docker compose up --build
```

**Service startup order:**
1. `init-db` — seeds `expense.db` from the local file into the named volume (first run only)
2. `migrate` — runs `python migrations/migrate.py` against the volume (idempotent, runs every startup)
3. `backend` — starts after migrations complete
4. `frontend` — starts after backend is healthy

| Service        | URL                             |
|----------------|---------------------------------|
| Frontend       | http://localhost                |
| Backend API    | http://localhost:8000           |
| Swagger UI     | http://localhost:8000/docs      |

The nginx container proxies `/api/` → `backend:8000`, so the frontend uses relative paths — no CORS issues.

The SQLite database is stored in a named Docker volume (`sqlite_data`) and persists across container restarts.

To seed the admin user inside the running container:

```bash
docker compose exec backend python seed_admin.py
```

To run migrations manually against the production volume:

```bash
docker compose run --rm migrate
```

---

## Environment Variables

### Backend — `backend/.env` (copy from `.env.example`)

| Variable                      | Default                        | Description                                      |
|-------------------------------|--------------------------------|--------------------------------------------------|
| `SECRET_KEY`                  | `change-me-…`                  | **Must be changed in production** — signs JWTs   |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30`                           | Access token lifetime                            |
| `REFRESH_TOKEN_EXPIRE_DAYS`   | `7`                            | Refresh token lifetime                           |
| `DATABASE_URL`                | `sqlite:///./expense.db`       | SQLAlchemy connection string                     |
| `CORS_ORIGINS`                | `http://localhost:5173,…`      | Comma-separated allowed origins                  |

### Frontend — `frontend/.env` (copy from `.env.example`)

| Variable            | Default                            | Description                                  |
|---------------------|------------------------------------|----------------------------------------------|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1`     | API base URL (not needed when using Docker proxy) |

---

## CI / CD

Two GitHub Actions workflows run on every push / PR to `main` or `develop`, scoped by path so a backend-only commit does not trigger the frontend pipeline.

### Backend CI (`.github/workflows/backend-ci.yml`)

```
Lint (ruff check + format --check)
    ↓
Test (pytest on Python 3.11 × 3.12 matrix, coverage XML artifact)
    ↓
Docker Build (cached, push=false)
```

### Frontend CI (`.github/workflows/frontend-ci.yml`)

```
Lint + Type-check (eslint --max-warnings 0 + tsc --noEmit)
    ↓
Test (vitest --coverage, lcov artifact)
    ↓
Build (tsc + vite build, dist/ artifact)
    ↓
Docker Build (cached, push=false)
```

Required GitHub secret: `SECRET_KEY` (set in repo Settings → Secrets).

---

## Default Credentials

The `seed_admin.py` script creates the following account (idempotent — safe to re-run):

| Field    | Value                 |
|----------|-----------------------|
| Username | `Admin`               |
| Email    | `admin@example.com`   |
| Password | `admin`               |

The login form accepts **either** the username (`Admin`) or the email address.

> **Change the password** via Settings → Security after first login in any non-local environment.
