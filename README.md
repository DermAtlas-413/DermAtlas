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

### Standard Setup
1. **Frontend:** Navigate to `client/`, install dependencies with `npm install`, and run `npx expo start`.
2. **Backend:** Navigate to `server/`, create a virtual environment, and install requirements.

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

**Current backlog — backend TDD green phase:**

The `server/` has 85 contract tests written (all currently red). Implementation work is tracked in beads with blocking dependencies enforcing order:

| Issue | Title | Status |
|---|---|---|
| DA-5rb | Implement ORM models | open — **start here** |
| DA-7hi | Implement auth utilities | blocked by DA-5rb |
| DA-hpu | POST /api/v1/auth/token | blocked by DA-5rb, DA-7hi |
| DA-iad | POST /api/v1/upload/image | blocked by DA-5rb, DA-7hi |
| DA-nao | POST /api/v1/lesion/analyze | blocked by DA-5rb, DA-7hi |
| DA-ack | POST /api/v1/feedback | blocked by DA-5rb, DA-7hi |
| DA-8hx | GET /api/v1/patients/{id} | blocked by DA-5rb, DA-7hi |

See `server/CLAUDE.md` for the full developer context, model schemas, and test-running instructions.