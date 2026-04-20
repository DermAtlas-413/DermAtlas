# Deployment Guide

## Environment Alignment

Maps server `ENV` modes to frontend `APP_ENV` and Netlify deployment contexts.

| Netlify context              | APP_ENV       | Server ENV  | USE_MOCK             | Backend              |
|------------------------------|---------------|-------------|----------------------|----------------------|
| deploy-preview (PR)          | development   | —           | true (demo) or false | localhost or staging |
| branch-deploy (staging)      | staging       | staging     | false                | Cloud Run staging    |
| production (main)            | production    | production  | false                | Cloud Run production |
| local dev                    | development   | development | optional             | localhost:8000       |

## Environment Variable Reference

### Client (set in Netlify dashboard)

| Variable   | development          | staging                              | production                            |
|------------|----------------------|--------------------------------------|---------------------------------------|
| `APP_ENV`  | Set via netlify.toml | Set via netlify.toml                 | Set via netlify.toml                  |
| `API_BASE` | http://localhost:8000/api/v1 | https://staging-api.example.com/api/v1 | https://api.example.com/api/v1 |
| `USE_MOCK` | `true` or unset      | `false`                              | `false`                               |

`APP_ENV` is hardcoded per Netlify context in `netlify.toml` and cannot be misconfigured.
`API_BASE` and `USE_MOCK` must be set in the Netlify dashboard per deployment context.

### Server (set in .env files or Cloud Run env)

| Variable            | development                | staging / production                               |
|---------------------|----------------------------|----------------------------------------------------|
| `ENV`               | development                | staging / production                               |
| `SECRET_KEY`        | default (change-me...)     | **Required** — generate with `openssl rand -hex 32`|
| `GCP_PROJECT_ID`    | optional                   | **Required**                                       |
| `GCS_BUCKET_NAME`   | optional                   | **Required**                                       |
| `ALLOWED_ORIGINS`   | empty (defaults to localhost) | **Required** — comma-separated Netlify URLs     |
| `DATABASE_URL`      | postgresql+asyncpg://...   | —                                                  |
| `USE_CLOUD_SQL_CONNECTOR` | false               | true                                               |

## Netlify Setup

1. Connect the repository to Netlify (build settings auto-detected from `netlify.toml`).
2. In **Site configuration > Environment variables**, set per deployment context:
   - **Production**: `API_BASE=https://api.example.com/api/v1`, `USE_MOCK=false`
   - **Branch deploys** (staging): `API_BASE=https://staging-api.example.com/api/v1`, `USE_MOCK=false`
   - **Deploy previews** (PRs): `API_BASE=https://staging-api.example.com/api/v1`, `USE_MOCK=true` (or `false`)
3. Deploy. The build command (`npm ci && npx expo export --platform web`) runs in `client/`.
4. The SPA redirect rule (`/* → /index.html`) handles client-side routing.

## Build Guards

`app.config.ts` throws hard at build time if:
- `USE_MOCK=true` in staging or production
- `API_BASE` contains "localhost" in staging or production

These guards prevent misconfigured deployments from reaching users.

## Server Deployment (Cloud Run)

```bash
# Generate a secret key
openssl rand -hex 32

# Deploy to Cloud Run
gcloud run deploy dermatlas-api \
  --image gcr.io/PROJECT_ID/dermatlas-api \
  --set-env-vars ENV=production,SECRET_KEY=<generated>,GCP_PROJECT_ID=<project>,GCS_BUCKET_NAME=<bucket>,ALLOWED_ORIGINS=https://your-site.netlify.app \
  --add-cloudsql-instances PROJECT_ID:REGION:INSTANCE
```

See `docs/DEPLOYMENT_CHEAT_SHEET.md` for full gcloud commands and rollback procedures.

## Verification

### Client build guards
```bash
# Must fail:
APP_ENV=staging USE_MOCK=true npx expo export --platform web
APP_ENV=production API_BASE=http://localhost:8000/api/v1 npx expo export --platform web

# Must succeed:
APP_ENV=production API_BASE=https://api.example.com/api/v1 USE_MOCK=false npx expo export --platform web
APP_ENV=development USE_MOCK=true npx expo export --platform web
```

### Server config guards
```bash
# Must fail:
ENV=staging SECRET_KEY="change-me-in-production-use-a-long-random-string" python -c "from app.core.config import Settings; Settings()"

# Must pass:
ENV=testing pytest tests/unit/test_config.py --no-cov
```

### Netlify
- Build log should contain no `[app.config.ts] BUILD FAILED` lines
- App loads at the Netlify URL
- Deep links (e.g. `/profile`) don't 404 on refresh (SPA redirect working)
- CORS preflight: `curl -I -X OPTIONS -H "Origin: https://your-site.netlify.app" https://api.example.com/api/v1/health`

## CI/CD Overview

GitHub Actions (`.github/workflows/ci.yml`) runs on PRs to `main`:
- **lint-client**: `npm run lint` (ESLint via Expo)
- **typecheck-client**: `npx tsc --noEmit`
- **lint-server**: `ruff check .`

> **TODO**: Add `test-server` job once the TDD cycle completes (see `server/CLAUDE.md`).
