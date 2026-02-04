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

* We commit the `.beads/` folder (JSONL files) to Git.
* We **do not** commit the local database (`beads.db`).
* Use `bd ready` to see available tasks.