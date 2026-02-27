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
alembic upgrade head
```

**4. Run the dev server**
```bash
uvicorn app.main:app --reload
```

The API is now available at `http://localhost:8000`.

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