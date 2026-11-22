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
- Paginated expense table (20 per page)
- Filter by date range, category, and payment method

### Dashboard
- **Billing Cycle Badge** — always shows the exact current billing window (e.g. 12 Nov → 11 Dec)
- **KPI Cards** (colour-coded):
  - 🔴 Total Spent — red, with transaction count
  - 🔴 Avg. Per Day — red, over the active billing cycle
  - 🔵 Monthly Salary — blue, with fixed expense subtotal
  - 🟢 Net Savings — green when positive, red when over budget
- **6-Cycle Spending Trend** — line chart of the past 6 billing cycles
- **Spend by Category** — horizontal bar chart (red bars) for the active billing cycle
- **Spend by Payment Method** — horizontal bar chart (amber bars) for the active billing cycle
- **Category Pie Chart** — proportional category breakdown for the active billing cycle

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
- Monthly Fixed Expenses — recurring items like rent, subscriptions
- Monthly Salary — used to compute Net Savings
- Profile — update name and email
- Security — change password

---

## Tech Stack

| Layer        | Technology                                   |
|--------------|----------------------------------------------|
| Frontend     | React 18, React Router v6, Vite 5            |
| Styling      | Tailwind CSS v3 (CSS variable–based theming) |
| Charts       | Recharts 2                                   |
| State/Data   | TanStack Query v5 + Zustand v5               |
| Forms        | React Hook Form v7 + Zod v3                  |
| Backend      | Python 3.11+, FastAPI 0.111                  |
| Auth         | JWT via `python-jose`, bcrypt via `passlib`  |
| Database     | SQLite via SQLAlchemy 2 ORM                  |
| Migrations   | Alembic 1.13                                 |
| Linter (BE)  | Ruff 0.5                                     |
| Linter (FE)  | ESLint 9 + typescript-eslint                 |
| Tests (BE)   | pytest + pytest-cov + httpx TestClient       |
| Tests (FE)   | Vitest 2 + Testing Library                   |
| Container    | Docker (multi-stage), nginx 1.27, Compose v2 |
| CI           | GitHub Actions                               |
| API Docs     | FastAPI auto-generated Swagger UI            |

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
| Column            | Type    | Notes                      |
|-------------------|---------|----------------------------|
| id                | INTEGER | PK                         |
| user_id           | INTEGER | FK → users                 |
| date              | TEXT    | YYYY-MM-DD                 |
| description       | TEXT    |                            |
| amount            | REAL    | INR                        |
| payment_method_id | INTEGER | FK → payment_methods       |
| category_id       | INTEGER | FK → categories            |
| created_at        | TEXT    | ISO 8601                   |

### `user_settings`
| Column                  | Type    | Notes                               |
|-------------------------|---------|-------------------------------------|
| id                      | INTEGER | PK                                  |
| user_id                 | INTEGER | FK → users, unique                  |
| billing_cycle_start_day | INTEGER | 1–28, **default 12**                |
| monthly_salary          | REAL    | for Net Savings calculation         |

### `fixed_expenses`
| Column      | Type    | Notes                        |
|-------------|---------|------------------------------|
| id          | INTEGER | PK                           |
| user_id     | INTEGER | FK → users                   |
| description | TEXT    | e.g., "Rent", "Netflix"      |
| amount      | REAL    |                              |
| category_id | INTEGER | FK → categories (nullable)   |

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
| GET    | /expenses         | List (paginated). Query: `page`, `page_size`, `start_date`, `end_date`, `category_id`, `payment_method_id` |
| POST   | /expenses         | Create expense                                         |
| GET    | /expenses/{id}    | Get single expense                                     |
| PUT    | /expenses/{id}    | Update expense                                         |
| DELETE | /expenses/{id}    | Delete expense                                         |

### Dashboard

All dashboard endpoints respect the user's `billing_cycle_start_day` setting.

| Method | Path                           | Description                                                      |
|--------|--------------------------------|------------------------------------------------------------------|
| GET    | /dashboard/summary             | KPIs for the current billing cycle + `cycle_start` / `cycle_end` |
| GET    | /dashboard/monthly-trend       | Totals for past N billing cycles (default 6). Query: `months`   |
| GET    | /dashboard/category-breakdown  | Category totals. Query: `start_date`, `end_date` (defaults to current cycle) |
| GET    | /dashboard/payment-breakdown   | Payment method totals. Query: `start_date`, `end_date` (defaults to current cycle) |

**`/dashboard/summary` response fields:**

```json
{
  "current_month": "2026-11",
  "cycle_start":   "2026-11-12",
  "cycle_end":     "2026-12-11",
  "total_spent":   12500.0,
  "transaction_count": 18,
  "avg_per_day":   416.67,
  "monthly_salary": 80000.0,
  "total_fixed":   25000.0,
  "savings":       42500.0
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
| `uvicorn app.main:app --reload` | `backend/` | Start API with hot-reload |
| `python seed_admin.py` | `backend/` | Create / verify admin user |
| `SECRET_KEY=x DATABASE_URL=sqlite:///:memory: pytest tests/ -v` | `backend/` | Run all backend tests |
| `ruff check . && ruff format --check .` | `backend/` | Lint + format check |
| `ruff format .` | `backend/` | Auto-format |
| `npm run dev` | `frontend/` | Vite dev server |
| `npm test` | `frontend/` | Vitest unit tests |
| `npm run lint:ci` | `frontend/` | ESLint (zero warnings) |
| `npm run type-check` | `frontend/` | TypeScript type check |
| `npm run build` | `frontend/` | Production bundle |

---

## Running with Docker

A single command builds and starts both services:

```bash
# Copy and customise env
cp backend/.env.example backend/.env   # set SECRET_KEY

docker compose up --build
```

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
