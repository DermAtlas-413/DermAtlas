# DermAtlas Server — Developer Context

FastAPI backend (Python 3.11, async SQLAlchemy, asyncpg). Lives in `server/`.
The repo root is one level up.

## Quick orientation

```
server/
├── app/
│   ├── api/api_v1/endpoints/   # Route handlers (health + submission exist today)
│   ├── core/config.py          # Pydantic Settings, loaded via get_settings()
│   ├── db/                     # Engine, session factory, Base declarative
│   ├── models/                 # ORM models (TO BE CREATED — see below)
│   └── schemas/                # Pydantic request/response models
├── tests/
│   ├── conftest.py             # All async fixtures
│   ├── fixtures/test_data.py   # Constants + payload builders
│   ├── unit/                   # Config, schema, auth-utils tests
│   └── integration/            # Endpoint contract tests
├── requirements.txt            # Production deps
├── requirements-dev.txt        # Dev/test deps
└── pytest.ini                  # asyncio_mode=auto, 80% coverage gate
```

## Running tests

```bash
cd server
source venv/bin/activate

# Collect only (no fixtures run, instant feedback)
ENV=testing pytest --co -q

# Run without coverage (fast, shows test names)
ENV=testing pytest --no-cov

# Run with coverage report
ENV=testing pytest

# Run a single file
ENV=testing pytest tests/unit/test_auth_utils.py --no-cov
```

`ENV=testing` is required — it bypasses the DATABASE_URL validation in Settings
so the aiosqlite in-memory engine is used instead of a real Postgres instance.

## TDD workflow — current state

The `tdd` branch holds **85 contract tests** that define the expected API
behaviour. As of now they are **all red** (ERROR or FAIL). This is intentional.

The red → green cycle is tracked in beads. Run `bd ready` to see what's
unblocked. The implementation order is enforced by blocking dependencies:

```
DA-5rb  ORM models          (unblocked — start here)
DA-7hi  auth utilities      (blocked by DA-5rb)
 ├── DA-hpu  auth endpoint      (blocked by DA-5rb + DA-7hi)
 ├── DA-iad  upload endpoint    (blocked by DA-5rb + DA-7hi)
 ├── DA-nao  analyze endpoint   (blocked by DA-5rb + DA-7hi)
 ├── DA-ack  feedback endpoint  (blocked by DA-5rb + DA-7hi)
 └── DA-8hx  patients endpoint  (blocked by DA-5rb + DA-7hi)
```

## What needs to be created

### ORM models (`app/models/`) — DA-5rb

All inherit from `app.db.base.Base`. Must use SQLite-compatible types (no
Postgres-only constructs) so aiosqlite tests work.

| File | Key columns |
|---|---|
| `user.py` | `user_id` PK, `email` UNIQUE, `password_hash`, `full_name`, `role` ENUM[PCP,PATIENT], `npi_number` nullable, `created_at` |
| `patient.py` | `patient_id` PK, `primary_physician_id` FK→User, `mrn_internal`, `date_of_birth`, `gender`, `created_at` |
| `clinical_image.py` | `query_id` UUID PK (String(36)), `user_id` FK→User, `patient_id` FK→Patient, `gcs_image_uri`, `vertex_vector_id`, `lesion_location`, `clinician_notes` nullable, `captured_at` |
| `reference_atlas.py` | `reference_id` UUID PK, `gcs_image_uri`, `vertex_vector_id`, `diagnosis_label`, `diagnosis_type`, `modality`, `body_part`, `source_dataset` |
| `recommendation_feedback.py` | `feedback_id` PK, `query_id` FK→ClinicalImage, `reference_id` FK→ReferenceAtlas, `user_id` FK→User, `is_helpful` BOOL, `feedback_timestamp`; UNIQUE(query_id, reference_id, user_id) |
| `audit_log.py` | `log_id` PK, `user_id` FK→User, `action` STR, `target_resource` STR, `timestamp` |

Create `app/models/__init__.py` that imports all six models so `Base.metadata`
is fully populated when the conftest `engine` fixture runs.

### Auth utilities (`app/core/auth.py`) — DA-7hi

```python
get_password_hash(plain: str) -> str         # passlib bcrypt
verify_password(plain: str, hashed: str) -> bool
create_access_token(data: dict, expires_delta_seconds: int | None = None) -> str
decode_access_token(token: str) -> dict      # raises jose.JWTError / ExpiredSignatureError
```

Add to `Settings`: `SECRET_KEY`, `ALGORITHM = "HS256"`, `ACCESS_TOKEN_EXPIRE_MINUTES = 30`.

### New endpoints — DA-hpu / DA-iad / DA-nao / DA-ack / DA-8hx

| Beads issue | Route | File |
|---|---|---|
| DA-hpu | `POST /api/v1/auth/token` | `endpoints/auth.py` |
| DA-iad | `POST /api/v1/upload/image` | `endpoints/upload.py` |
| DA-nao | `POST /api/v1/lesion/analyze` | `endpoints/lesion.py` |
| DA-ack | `POST /api/v1/feedback` | `endpoints/feedback.py` |
| DA-8hx | `GET  /api/v1/patients/{patient_id}` | `endpoints/patients.py` |

Register each in `app/api/api_v1/api.py`.

Run `bd show <id>` for the full spec of any endpoint.

## Test fixtures cheat-sheet

The `conftest.py` engine fixture uses `aiosqlite:///:memory:` — no real DB needed.
Each test function gets a fresh `db_session` that's rolled back at teardown.

Key fixtures available in every test:

| Fixture | What it provides |
|---|---|
| `client` | `httpx.AsyncClient` wired to the app |
| `pcp_user` | User row, role=PCP |
| `patient_user` | User row, role=PATIENT |
| `other_pcp_user` | Second PCP (no relation to `patient_record`) |
| `patient_record` | Patient row owned by `pcp_user` |
| `clinical_image` | ClinicalImage row owned by `pcp_user` |
| `reference_image` | ReferenceAtlas row |
| `pcp_token` | `{"Authorization": "Bearer <jwt>"}` for `pcp_user` |
| `patient_token` | Bearer header for `patient_user` |
| `other_pcp_token` | Bearer header for `other_pcp_user` |
| `test_jpeg_bytes` | 1×1 px JPEG bytes |
| `mock_gcs` | GCS Client patched — won't make real network calls |
| `mock_vertex` | Vertex AI patched — won't make real network calls |

## Coverage

The `pytest.ini` enforces `--cov-fail-under=80`. While tests are red this gate
is unreachable; it kicks in once implementation progresses. Individual runs with
`--no-cov` skip it.
