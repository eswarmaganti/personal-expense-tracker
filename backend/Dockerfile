# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /app

# Install dependencies into a prefix so we can copy them cleanly
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# SQLite data directory (mount a volume here in production)
RUN mkdir -p /data

# Non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app /data
USER appuser

EXPOSE 8000

# DATABASE_URL and SECRET_KEY should be injected via env vars / secrets
ENV DATABASE_URL=sqlite:////data/expense.db \
    ACCESS_TOKEN_EXPIRE_MINUTES=30 \
    REFRESH_TOKEN_EXPIRE_DAYS=7

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
