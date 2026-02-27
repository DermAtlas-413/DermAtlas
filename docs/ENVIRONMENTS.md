# DermAtlas Environments

## Mode Comparison

| Mode | Database | GCS / Vertex | DEBUG | Env file loaded |
|------|----------|--------------|-------|-----------------|
| `development` | Local Postgres (docker-compose, port 5432) | Empty strings (optional) | `true` | `.env.development` → `.env` |
| `testing` | Local Postgres (docker-compose, port 5433) | Test stubs | `true` | `.env.testing` → `.env` |
| `staging` | Cloud SQL via connector | Real GCP project | `false` | `.env.staging` (gitignored) |
| `production` | Cloud SQL via connector | Real GCP project | `false` | `.env.production` (gitignored) |

The active mode is selected by the `ENV` environment variable (defaults to `development`).

---

## Quick-Start: Local Development

```bash
# 1. Start Postgres
cd server && docker-compose up -d

# 2. Copy env defaults (skip if .env.development is sufficient)
# cp .env.development .env   # only needed for personal overrides

# 3. Run the server
ENV=development uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/api/v1/health`

---

## Variable Reference

### Core
| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | Runtime mode: `development`, `testing`, `staging`, `production` |
| `DEBUG` | `false` | Enable verbose logging and SQL echo |
| `APP_NAME` | `DermAtlas API` | Application display name |

### Direct Connection (development / testing)
| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@localhost:5432/db` | Async SQLAlchemy URL |
| `USE_CLOUD_SQL_CONNECTOR` | `false` | Set `true` to use Cloud SQL connector instead |

### Cloud SQL Connector (staging / production)
| Variable | Example | Description |
|----------|---------|-------------|
| `USE_CLOUD_SQL_CONNECTOR` | `true` | Enable Cloud SQL connector |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME` | `project:region:instance` | Cloud SQL instance identifier |
| `PGUSER` | `dermatlas` | Database user |
| `PGPASSWORD` | *(secret)* | Database password |
| `PGDATABASE` | `dermatlas_prod` | Database name |

### Google Cloud Platform
| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | GCP project ID |
| `GCS_BUCKET_NAME` | Cloud Storage bucket for image uploads |
| `VERTEX_AI_INDEX_ENDPOINT` | Vertex AI Vector Search endpoint |

---

## Staging / Production Deployment (Cloud Run)

Set environment variables in Cloud Run service configuration or Secret Manager:

```bash
gcloud run services update dermatlas-api \
  --set-env-vars ENV=production \
  --set-secrets "PGPASSWORD=dermatlas-db-password:latest" \
  --region us-central1
```

The `USE_CLOUD_SQL_CONNECTOR=true` flag causes the app to use the Cloud SQL Python
Connector instead of a direct TCP URL, so no Cloud SQL Auth Proxy sidecar is needed.

---

## Alembic Migrations

Initial setup (one-time):
```bash
cd server && alembic init alembic
# Edit alembic/env.py to import Base from app.db.base and use async engine
```

Run migrations locally:
```bash
ENV=development alembic upgrade head
```

Run against Cloud SQL (via Auth Proxy or Cloud Run Job):
```bash
cloud-sql-proxy project:region:instance &
ENV=staging DATABASE_URL=postgresql+asyncpg://... alembic upgrade head
```
