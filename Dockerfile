FROM python:3.12-slim AS backend

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ /app/backend/

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

COPY --from=backend /app/backend/ /app/backend/
COPY --from=frontend /build/dist/ /app/frontend/dist/

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
