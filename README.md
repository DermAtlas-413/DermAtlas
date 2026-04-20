# DermAtlas

DermAtlas is a Clinical Decision Support (CDS) system designed to assist Primary Care Physicians (PCPs). It uses Content-Based Image Retrieval (CBIR) to find and display historical, expert-labeled skin lesion cases visually similar to a patient's current condition.

> **Note:** This tool provides decision support via visual comparison. It does **not** provide automated diagnoses or probability scores.

## Tech Stack

* **Frontend:** React Native (Expo) - iOS, Android, Web
* **Backend:** Python FastAPI (Async)
* **Infrastructure:** Google Cloud Platform (Cloud Run, Cloud SQL, Cloud Storage)
* **AI/ML:** Google Vertex AI (Multimodal Embeddings + Vector Search)

---

## Development Setup

### Frontend
Navigate to `client/`, install dependencies with `npm install`, and run `npx expo start`.

To exercise the UI without a live backend or GCP credentials, start Expo with mock data:
```bash
cd client
USE_MOCK=true npx expo start
```
Mock data is wired up in `client/services/*.ts` and matches the real response shapes, so every screen renders (including the split benign/malignant similarity results on the compare screen).

### Backend (local)

**Prerequisites:** Python 3.11+, Docker

**1. Start Postgres**
```bash
cd server
docker compose up -d dermatlas-postgres
```
This spins up Postgres 15 on `localhost:5432` with database `dermatlas_dev` (user/pass: `dermatlas/dermatlas`).

**2. Create and activate a virtual environment**
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

**3. Apply database migrations**
```bash
ENV=development alembic upgrade head
```

**4. Seed test users**
```bash
ENV=development python scripts/seed_users.py
```
This inserts two PCP accounts you can log in with:

| Email | Password |
|---|---|
| `dr.smith@dermatlas.test` | `TestPass123!` |
| `dr.jones@dermatlas.test` | `TestPass123!` |

Re-running the script is safe — it skips users that already exist.

**5. Run the dev server**
```bash
uvicorn app.main:app --reload
```

The API is now available at `http://localhost:8000`.

> **Note on GCP-backed features:** `POST /api/v1/upload/image` and `POST /api/v1/lesion/analyze` call Google Cloud Storage and Vertex AI. For these to succeed end-to-end you need `GCP_PROJECT_ID`, `GCS_BUCKET_NAME`, and `VERTEX_AI_INDEX_ENDPOINT` set in `server/.env`, plus `gcloud auth application-default login` for ADC. If you only need to verify UI changes, skip this and run the client with `USE_MOCK=true` (see above).

**Tear-down when you're done:**
```bash
cd server && docker compose down          # keep the data volume
cd server && docker compose down -v       # also wipe dermatlas_dev_data
```

#### API Documentation

| URL | Description |
|---|---|
| `http://localhost:8000/docs` | **Swagger UI** — interactive, try endpoints directly in the browser. Use the **Authorize** button to log in and get a JWT for protected routes. |
| `http://localhost:8000/redoc` | **ReDoc** — clean, readable reference documentation. |
| `http://localhost:8000/openapi.json` | Raw OpenAPI schema. |

#### Running Tests
Tests use an in-memory SQLite database — no Postgres or Docker required.
```bash
cd server
source venv/bin/activate
ENV=testing pytest --no-cov    # fast, no coverage gate
ENV=testing pytest             # full run with 80% coverage gate
```

### (Optional) AI-Assisted Workflow with Beads
For developers using **Claude Code** or AI agents, we use [Beads](https://github.com/steveyegge/beads) (`bd`) to manage context and tasks.

**1. Install Beads**
```bash
# macOS/Linux
brew install beads

```

**2. Initialize (Team Mode)**

```bash
bd init --team

```

**3. Connect to Claude (Optional)**
If you use Claude Code in the terminal, this injects task context automatically:

```bash
bd setup claude

```

**How we use it:**

* We commit the `.beads/` folder (JSONL files) to Git — issues travel with the code.
* We **do not** commit the local database (`beads.db`) — it's rebuilt locally from the JSONL files.
* Use `bd ready` to see available tasks.

**Common commands (run from `server/`):**

```bash
bd ready                                    # Issues you can start now (no blockers)
bd list                                     # All open issues
bd show <id>                                # Full spec: what to build, which tests to pass
bd update <id> --status=in_progress         # Claim an issue before starting
bd close <id>                               # Mark complete
bd sync                                     # Sync issue changes with remote
```

**Checking the backlog:**
```bash
bd ready       # issues you can start now
bd list        # all open issues
```

See `server/CLAUDE.md` for the full developer context, model schemas, and test-running instructions.