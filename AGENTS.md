# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack
- **Frontend**: React 18 + Vite + TypeScript, Tailwind CSS, TanStack Query v5, React Hook Form + Zod, Recharts, Zustand
- **Backend**: Python FastAPI + SQLAlchemy 2 + SQLite (`expense.db`), JWT auth via `python-jose`
- **Monorepo layout**: `frontend/` and `backend/` are independent — commands must be run from their respective directories

## Commands

### Backend (run from `backend/`)
```bash
source venv/bin/activate
uvicorn app.main:app --reload --port 8000                              # dev server
SECRET_KEY=x DATABASE_URL=sqlite:///:memory: python -m pytest tests/ -v  # all tests
ruff check . && ruff format --check .                                  # lint + format check
ruff format .                                                           # auto-format
```
First-time setup: `python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt`

### Frontend (run from `frontend/`)
```bash
npm run dev      # Vite dev server on :5173
npm run build    # tsc + vite build
npm run lint     # eslint
```

## Critical Patterns

### Backend
- All models live in [`backend/app/models/models.py`](backend/app/models/models.py). The `__init__.py` re-exports them — always import from `app.models`, not the submodule directly.
- `Base.metadata.create_all(bind=engine)` runs in `main.py` on startup — tables are auto-created in development; use Alembic for schema changes in production.
- Every router endpoint validates category/payment_method FK ownership against `current_user.id` — never trust bare IDs from the client.
- `UserSettings` row is created automatically on register. If missing at runtime, settings endpoints auto-create it.
- `_billing_period()` in `dashboard.py` calculates the current billing window based on `billing_cycle_start_day` — month boundary wrapping is handled there.
- JWT: access tokens expire in 30 min, refresh tokens in 7 days. The `type` claim (`"access"` / `"refresh"`) is verified — passing the wrong token type returns 401.

### Frontend
- Path alias `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.json`).
- Auth state is persisted to `localStorage` via Zustand `persist` middleware (key: `expense-tracker-auth`). Logout clears all three fields: `user`, `accessToken`, `refreshToken`.
- The Axios client ([`src/api/client.ts`](frontend/src/api/client.ts)) auto-refreshes on 401 using the stored `refreshToken` and queues concurrent requests during refresh. If refresh fails, it calls `logout()` and redirects to `/login`.
- `PrivateRoute` checks `isAuthenticated()` from `useAuthStore` — it only tests for a non-null access token, not token expiry. Expiry is handled server-side via the 401 interceptor.
- Currency is formatted as INR (₹) using `formatCurrency()` in [`src/lib/utils.ts`](frontend/src/lib/utils.ts). Change the locale/currency there to adjust globally.
- Native `<select>` is used (not Radix Select) — the custom `Select` component in [`src/components/ui/select.tsx`](frontend/src/components/ui/select.tsx) wraps it with Tailwind styling.
- TanStack Query `staleTime` is 1 minute globally. Mutations that affect dashboard charts must manually invalidate `dashboard-summary`, `category-breakdown`, and `payment-breakdown` query keys.

## Environment Variables
- Backend reads from `backend/.env` (copy from `backend/.env.example`). `SECRET_KEY` must be changed for production.
- Frontend reads `VITE_API_BASE_URL` from `frontend/.env`. In dev, the Vite proxy (`/api` → `:8000`) means the env var is optional — requests fall back to `/api/v1`.
