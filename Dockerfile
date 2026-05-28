# ── Backend deps stage ───────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Frontend build stage ─────────────────────────────────────────
FROM node:20-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ .
RUN npx vite build

# ── Final image ──────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy pip packages from deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages/ /usr/local/lib/python3.12/site-packages/
COPY --from=deps /usr/local/bin/ /usr/local/bin/

# Copy application code
COPY backend/ /app/backend/
COPY --from=frontend /build/dist/ /app/frontend/dist/

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
