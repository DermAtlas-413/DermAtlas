# How to Use DermAtlas

DermAtlas is a Clinical Decision Support (CDS) system for Primary Care Physicians (PCPs). It uses Content-Based Image Retrieval (CBIR) to surface historical, expert-labeled skin lesion cases visually similar to a patient's uploaded photo.

> **Note for TAs / Graders:** The GCP production instances (Cloud Run, Cloud SQL, Cloud Storage, Vertex AI) are currently **offline** to avoid ongoing cloud charges. To evaluate the full live system, please reach out to the team and we will spin them back up. In the meantime, the full UI can be demoed using **mock mode** (see Quick Start below), and the backend and its test suite run entirely locally with no GCP credentials required.

---

## Quick Start (Demo Mode — No GCP Required)

The fastest way to run the full UI without any cloud credentials is to use mock data.

**Step 1: Clone the repository**
```bash
git clone <repo-url>
cd DermAtlas
```

**Step 2: Install frontend dependencies**
```bash
cd client
npm install
```

**Step 3: Start the frontend with mock data**
```bash
USE_MOCK=true npx expo start
```

Press `w` to open in the browser, or scan the QR code in Expo Go on your mobile device. All screens render with realistic mock data — no backend needed.

---

## Full Local Setup (Backend + Frontend)

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Python | 3.11+ |
| Docker | Any recent version |

---

### Step 1 — Start the Database

```bash
cd server
docker compose up -d dermatlas-postgres
```

This starts Postgres 15 on `localhost:5432` with database `dermatlas_dev` (credentials: `dermatlas/dermatlas`).

---

### Step 2 — Set Up the Python Environment

```bash
cd server
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
```

---

### Step 3 — Configure Environment Variables

```bash
cp .env.example .env
```

Edit `server/.env` and set at minimum:
```
DEBUG=true
SECRET_KEY=any-random-string-for-local-dev
```

For GCP-backed features (image upload, vector search), also set:
```
GCP_PROJECT_ID=your-gcp-project
GCS_BUCKET_NAME=your-bucket
VERTEX_AI_INDEX_ENDPOINT=projects/.../indexEndpoints/...
VERTEX_AI_DEPLOYED_INDEX_ID=your-deployed-index-id
```

If you only want to verify the UI, skip the GCP variables and use `USE_MOCK=true` on the frontend instead.

---

### Step 4 — Apply Database Migrations

```bash
ENV=development alembic upgrade head
```

---

### Step 5 — Seed Test Users

```bash
ENV=development python scripts/seed_users.py
```

This creates two PCP accounts you can log in with immediately:

| Email | Password |
|-------|----------|
| `dr.smith@dermatlas.test` | `TestPass123!` |
| `dr.jones@dermatlas.test` | `TestPass123!` |

Re-running the script is safe — it skips users that already exist.

---

### Step 6 — Start the Backend

```bash
uvicorn app.main:app --reload
```

The API is now at `http://localhost:8000`.

Interactive API documentation:
- **Swagger UI**: `http://localhost:8000/docs` — click **Authorize**, enter the credentials above, and test every endpoint directly in the browser.
- **ReDoc**: `http://localhost:8000/redoc` — clean readable reference.

---

### Step 7 — Start the Frontend

```bash
cd client
npm install
npx expo start
```

Press `w` to open the web version, or scan the QR code with Expo Go.

---

## Core Workflows

### As a PCP — Analyze a Patient's Skin Lesion

1. **Log in** with your PCP credentials on the login screen.
2. Navigate to **Upload** and select a patient from your patient list.
3. Upload a JPEG or PNG photo of the lesion (max 10 MB), select the body location, and optionally add clinical notes.
4. Tap **Analyze** — the system generates an embedding via Vertex AI and retrieves the top visually similar cases from the reference atlas.
5. The **Compare** screen shows up to 5 closest benign and 5 closest malignant reference images, plus an ML-derived malignancy probability and primary diagnosis.
6. Tap the thumbs-up/down icons to submit relevance feedback on individual reference cases.

### Register a New Clinical Network

1. On the login screen, tap **Register New Network**.
2. Provide a network name, your email, a password (min 8 characters), your full name, and your 10-digit NPI number.
3. You become the network admin automatically.

### Admin — Manage Users and Patients

1. Log in with an admin PCP account.
2. Navigate to **Admin** in the menu to view all users and patients in your network.
3. Use the **Reassign Physician** action to move a patient to a different PCP.
4. Deactivate/reactivate accounts using the two-step confirmation flow.

---

## Running Tests

Tests use an in-memory SQLite database — no Postgres or Docker required.

```bash
cd server
source venv/bin/activate

# Fast run (no coverage gate)
ENV=testing pytest --no-cov

# Full run (enforces 80% coverage)
ENV=testing pytest
```

---

## Tear Down

```bash
cd server
docker compose down        # stop containers, keep data
docker compose down -v     # stop containers and wipe the database volume
```
