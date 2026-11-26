import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models import (  # noqa: F401 — registers models
    Category,
    Expense,
    FixedExpense,
    PaymentMethod,
    User,
    UserBillingCycleSettings,
)
from app.routers import auth_router, dashboard_router, expenses_router, settings_router

# create all tables on startup (Alembic handles migrations in production)
Base.metadata.create_all(bind=engine)

# Origins are configured via CORS_ORIGINS env var (comma-separated) or fall back to defaults
_cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:80,http://localhost",
).split(",")

app = FastAPI(
    title="Personal Expense Tracker API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(expenses_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(settings_router, prefix=API_PREFIX)


@app.get("/")
def health():
    return {"status": "ok", "message": "Personal Expense Tracker API"}
