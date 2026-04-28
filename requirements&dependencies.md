# Requirements & Dependencies

## System Requirements

| Component | Requirement |
|-----------|-------------|
| Node.js | 18 or later |
| Python | 3.11 or later |
| Docker | Any recent version (for local Postgres) |
| Operating System | macOS, Linux, or Windows (WSL2 recommended) |

---

## Backend — Python (FastAPI)

The server lives in `server/`. There are two requirements files:

- **`server/requirements.txt`** — production dependencies only (installed in the Docker image deployed to Cloud Run)
- **`server/requirements-dev.txt`** — extends production deps with testing and development tools

### Installation

```bash
cd server
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# For local development and testing (includes everything)
pip install -r requirements-dev.txt

# For production / Docker only
pip install -r requirements.txt
```

### Production Dependencies (`requirements.txt`)

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | ≥0.109.0 | Web framework — routing, dependency injection, OpenAPI generation |
| `uvicorn[standard]` | ≥0.27.0 | ASGI server to run the FastAPI app |
| `pydantic` | ≥2.5.0 | Request/response schema validation |
| `pydantic-settings` | ≥2.1.0 | Environment variable configuration management |
| `python-multipart` | ≥0.0.6 | Multipart form parsing (required for file uploads) |
| `httpx` | ≥0.26.0 | Async HTTP client |
| `google-cloud-storage` | ≥2.14.0 | Upload and retrieve images from Google Cloud Storage |
| `google-cloud-aiplatform` | ≥1.38.0 | Vertex AI Multimodal Embeddings and Vector Search |
| `sqlalchemy[asyncio]` | ≥2.0.0 | Async ORM for database access |
| `asyncpg` | ≥0.29.0 | Async PostgreSQL driver |
| `alembic` | ≥1.13.0 | Database schema migrations |
| `cloud-sql-python-connector[asyncpg]` | ≥1.7.0 | Secure connection to Cloud SQL from Cloud Run |
| `python-jose[cryptography]` | ≥3.3.0 | JWT creation and verification |
| `passlib[bcrypt]` | ≥1.7.4 | Password hashing (bcrypt) |
| `pgvector` | ≥0.2.4 | pgvector extension support for PostgreSQL |
| `xgboost` | ≥2.0.0 | XGBoost classifier for ML inference pipeline |
| `scikit-learn` | ≥1.3.0 | Preprocessing and supporting ML utilities |
| `numpy` | ≥1.24.0 | Numerical array operations |
| `torch` | ≥2.0.0 | PyTorch MLP model for lesion classification |

### Development-Only Dependencies (`requirements-dev.txt`)

Includes all production deps plus:

| Package | Version | Purpose |
|---------|---------|---------|
| `pytest` | ≥7.4.0 | Test runner |
| `pytest-asyncio` | ≥0.23.0 | Async test support |
| `pytest-cov` | ≥4.1.0 | Test coverage reporting (enforces 80% gate) |
| `pytest-mock` | ≥3.12.0 | Mocking utilities (used to patch GCS and Vertex AI) |
| `aiosqlite` | ≥0.19.0 | In-memory SQLite engine for tests (no real DB needed) |
| `ruff` | ≥0.1.0 | Fast Python linter and formatter |
| `python-dotenv` | ≥1.0.0 | Load `.env` files locally |
| `Pillow` | ≥10.0.0 | Image generation in test fixtures |
| `anyio[trio]` | ≥4.2.0 | Async test infrastructure |
| `asgi-lifespan` | ≥2.1.0 | ASGI lifespan management for testing |

---

## Frontend — React Native (Expo)

The client lives in `client/`.

### Installation

```bash
cd client
npm install
```

### Dependencies (`client/package.json`)

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | ~54.0.33 | React Native managed workflow and toolchain |
| `react` | 19.1.0 | UI library |
| `react-native` | 0.81.5 | React Native runtime |
| `react-native-web` | ~0.21.0 | Web target for Expo |
| `expo-router` | ~6.0.23 | File-based routing |
| `@react-navigation/native` | ^7.1.8 | Navigation primitives |
| `@react-navigation/bottom-tabs` | ^7.4.0 | Bottom tab navigator |
| `expo-image-picker` | ~17.0.10 | Camera roll and file picker for image upload |
| `expo-image` | ~3.0.11 | Performant image component with caching |
| `zustand` | ^5.0.12 | Lightweight global state management |
| `react-native-reanimated` | ~4.1.1 | Declarative animations |
| `react-native-gesture-handler` | ~2.28.0 | Touch gesture recognition |
| `react-native-safe-area-context` | ~5.6.0 | Safe area insets for notched devices |
| `react-native-screens` | ~4.16.0 | Native screen management |
| `expo-haptics` | ~15.0.8 | Haptic feedback |
| `@expo/vector-icons` | ^15.0.3 | Icon set |
| `typescript` | ~5.9.2 | Static typing |

---

## Infrastructure / Cloud (Production)

| Service | Purpose |
|---------|---------|
| Google Cloud Run | Hosts the containerized FastAPI backend |
| Google Cloud SQL (Postgres 15) | Managed relational database |
| Google Cloud Storage | Stores uploaded clinical images and reference atlas images |
| Vertex AI Multimodal Embeddings | Generates 1408-dim image embeddings (`multimodalembedding@001`) |
| Vertex AI Vector Search | Nearest-neighbor retrieval over the reference atlas embeddings |
| Netlify | Hosts the web frontend build |

---

## Environment Variables

Copy `server/.env.example` to `server/.env` and fill in the values below.

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | Random secret for JWT signing |
| `ALGORITHM` | No (default: `HS256`) | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No (default: `30`) | JWT token lifetime |
| `DATABASE_URL` | Yes (production) | Postgres connection string |
| `GCP_PROJECT_ID` | Yes (production) | Google Cloud project ID |
| `GCS_BUCKET_NAME` | Yes (production) | GCS bucket for image storage |
| `VERTEX_AI_INDEX_ENDPOINT` | Yes (production) | Full resource name of the Vertex AI index endpoint |
| `VERTEX_AI_DEPLOYED_INDEX_ID` | Yes (production) | Deployed index ID within the endpoint |
| `DEBUG` | No (default: `false`) | Enable debug mode and verbose logging |

For local development, `ENV=testing` bypasses `DATABASE_URL` validation and uses an in-memory SQLite database instead.
