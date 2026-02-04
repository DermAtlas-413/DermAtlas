# DermAtlas API Server

FastAPI backend for the DermAtlas dermatology image analysis application.

## Quick Start

### Prerequisites

- Python 3.12+
- pip

### Local Development Setup

```bash
# Navigate to server directory
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt

# Copy environment template and configure
cp .env.example .env
# Edit .env with your settings

# Run development server
uvicorn app.main:app --reload
```

### Access the API

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/api/v1/health

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DEBUG` | Enable debug mode | No (default: false) |
| `GCP_PROJECT_ID` | Google Cloud project ID | Yes (for production) |
| `GCS_BUCKET_NAME` | GCS bucket for image storage | Yes (for production) |
| `VERTEX_AI_INDEX_ENDPOINT` | Vertex AI Vector Search endpoint | Yes (for production) |

## API Endpoints

### Health

- `GET /api/v1/health` - Health check endpoint

### Submissions

- `POST /api/v1/submissions` - Submit an image for analysis

## Docker

```bash
# Build image
docker build -t dermatlas-api .

# Run container
docker run -p 8080:8080 dermatlas-api

# With environment variables
docker run -p 8080:8080 \
  -e GCP_PROJECT_ID=your-project \
  -e GCS_BUCKET_NAME=your-bucket \
  dermatlas-api
```

## Dependencies

### Why Two Requirements Files?

- **`requirements.txt`** - Production dependencies only. These packages are installed in the Docker container and deployed to Cloud Run. Includes:
  - `fastapi` - The web framework
  - `uvicorn[standard]` - ASGI server to run the app
  - `pydantic` / `pydantic-settings` - Data validation and settings management
  - `python-multipart` - Handle file uploads
  - `httpx` - Async HTTP client for calling external APIs
  - `google-cloud-storage` - Upload/download images from GCS buckets
  - `google-cloud-aiplatform` - Vertex AI for embeddings and vector search

- **`requirements-dev.txt`** - Development and testing tools. NOT deployed to production. Includes everything in `requirements.txt` plus:
  - `pytest` / `pytest-asyncio` - Run tests
  - `ruff` - Fast Python linter and formatter
  - `python-dotenv` - Load `.env` files locally (not needed in Cloud Run)

**For local development**: Use `pip install -r requirements-dev.txt` (includes everything)
**For production/Docker**: The Dockerfile uses `requirements.txt` (smaller image, no dev tools)

## Testing

```bash
# Run tests
pytest

# Run with coverage
pytest --cov=app
```

## Architecture & Best Practices

This backend follows established FastAPI patterns and security best practices:

### Project Structure

Based on [zhanymkanov/fastapi-best-practices](https://github.com/zhanymkanov/fastapi-best-practices):

- **Separate `schemas/` directory** - Pydantic models for request/response validation
- **Versioned API routes** (`/api/v1/`) - Allows non-breaking API evolution
- **Config with dependency injection** - Using `@lru_cache` for settings

### Configuration

Following [Pydantic Settings documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/):

- Environment variables loaded via `pydantic-settings`
- Cached settings instance to avoid re-parsing on every request

### Docker Security

Following [OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html):

- Non-root user (`appuser`) for container execution
- Multi-stage build to minimize attack surface
- No secrets in image layers

### Cloud Run Deployment

Following [Google Cloud Run Python Tips](https://docs.cloud.google.com/run/docs/tips/python):

- `PYTHONUNBUFFERED=1` for proper logging
- `--proxy-headers` flag for HTTPS detection behind load balancer
- Uvicorn (not Gunicorn) - Cloud Run manages scaling externally

## Project Structure

```
server/
├── requirements.txt          # Production dependencies
├── requirements-dev.txt      # Development dependencies
├── Dockerfile               # Production Docker image
├── .env.example             # Environment template
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py        # Settings management
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── health.py        # Health check models
│   │   └── submission.py    # Submission models
│   └── api/
│       └── api_v1/
│           ├── api.py       # Router aggregator
│           └── endpoints/
│               ├── health.py
│               └── submission.py
```
