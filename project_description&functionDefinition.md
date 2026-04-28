# Project Description & Function Definitions

## Project Description

**DermAtlas** is a Clinical Decision Support (CDS) system designed to assist Primary Care Physicians (PCPs) when evaluating skin lesions. Rather than delivering automated diagnoses, DermAtlas surfaces expert-labeled historical cases that are visually similar to a patient's uploaded photo, giving the physician comparable, ground-truth-labeled examples to inform their clinical judgment.

### Core Workflow

1. A PCP uploads a photo of a patient's skin lesion.
2. The backend generates a 1408-dimensional image embedding using Google Vertex AI's Multimodal Embedding model.
3. Vertex AI Vector Search retrieves the nearest neighbors from the reference atlas (HAM10000 / ISIC 2019 datasets).
4. An on-server ML pipeline (MLP + XGBoost) produces a per-class softmax distribution and a binary malignancy probability with a calibrated risk flag.
5. The physician sees the top 5 most similar benign cases and the top 5 most similar malignant cases side-by-side, plus the ML-derived risk signal.
6. Physicians can submit thumbs-up/thumbs-down feedback on individual reference cases, which feeds back into a believability score over time.

### Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React Native (Expo) — iOS, Android, Web |
| Backend | Python FastAPI (async) |
| Database | PostgreSQL 15 via SQLAlchemy async ORM |
| Object Storage | Google Cloud Storage |
| AI/ML | Google Vertex AI Multimodal Embeddings + Vector Search, PyTorch MLP, XGBoost |
| Deployment | Cloud Run (backend), Netlify (web frontend) |

---

## Backend — Module & Function Reference

### `app/core/auth.py` — Authentication Utilities

**`get_password_hash(plain: str) -> str`**
Hashes a plain-text password with bcrypt. Returns the hashed string to store in the database. Never stores plain-text passwords.

**`verify_password(plain: str, hashed: str) -> bool`**
Checks a plain-text password against a stored bcrypt hash. Returns `True` if they match, `False` otherwise.

**`create_access_token(data: dict, expires_delta_seconds: int | None = None) -> str`**
Creates a signed JWT from the given payload dict. If `expires_delta_seconds` is not supplied, uses `ACCESS_TOKEN_EXPIRE_MINUTES` from settings. Embeds `sub` (user ID), `role`, `email`, `full_name`, `network_id`, and `is_admin` claims.

**`decode_access_token(token: str) -> dict`**
Decodes and verifies a JWT. Raises `jose.JWTError` on invalid signature, `jose.ExpiredSignatureError` on expiry.

---

### `app/core/deps.py` — FastAPI Dependency Functions

**`get_current_user(token, db) -> User`**
FastAPI dependency. Extracts and validates the Bearer JWT from the request, looks up the user in the database, and returns the `User` ORM object. Raises `HTTP 401` if the token is missing, expired, or invalid.

**`require_pcp(current_user) -> User`**
Dependency that wraps `get_current_user` and enforces the `PCP` role. Raises `HTTP 403` if the authenticated user is a patient.

**`require_network_admin(current_user) -> User`**
Dependency that wraps `require_pcp` and additionally enforces `is_admin=True`. Raises `HTTP 403` for non-admin PCPs.

---

### `app/api/api_v1/endpoints/auth.py` — Auth Endpoints

**`POST /api/v1/auth/token`** — `login(request, db)`
OAuth2 password flow. Accepts `username` (email) and `password` as form fields. Validates credentials, updates `last_login_at`, writes an `AuditLog` entry, and returns a `TokenResponse` containing a signed JWT. Returns `HTTP 401` for invalid credentials, `HTTP 422` for missing fields.

**`POST /api/v1/auth/register-network`** — `register_network(payload, db)`
Public self-serve endpoint. Creates a new `Network` row and its first admin `User` (role=PCP, is_admin=True). Validates NPI format, email uniqueness, and network name uniqueness. Returns a JWT for the new admin on success (`HTTP 201`).

---

### `app/api/api_v1/endpoints/upload.py` — Image Upload

**`POST /api/v1/upload/image`** — `upload_image(file, patient_id, lesion_location, clinician_notes, current_user, db)`
Requires PCP role. Validates the uploaded file (JPEG or PNG, max 10 MB), verifies the patient belongs to the requesting physician, uploads the file to GCS, persists a `ClinicalImage` record, and writes an audit log. Returns `{"query_id": "<uuid>"}` on success (`HTTP 201`). Returns `HTTP 400` for invalid file type or empty file, `HTTP 403` if the patient is not assigned to this physician, `HTTP 413` for files over 10 MB, `HTTP 503` if GCS is unavailable.

---

### `app/api/api_v1/endpoints/lesion.py` — Lesion Analysis

**`_get_image_embedding(gcs_uri: str) -> list[float]`**
Generates a 1408-dimensional image embedding by calling the Vertex AI `multimodalembedding@001` model on a GCS-hosted image.

**`POST /api/v1/lesion/analyze`** — `analyze_lesion(payload, current_user, db)`
Requires PCP role. Fetches the `ClinicalImage` by `query_id`, verifies ownership, generates the embedding, queries Vertex AI Vector Search for 25 nearest neighbors, enriches results with `ReferenceAtlas` metadata, partitions into benign/malignant lists (top 5 each), runs the ML pipeline (`run_inference`), persists a `ClinicalImagePrediction` record, and returns an `AnalyzeResponse`. Also computes a `believability_score` from historical physician feedback on the retrieved neighbors. Returns `HTTP 404` if the query does not exist, `HTTP 403` for ownership violations, `HTTP 503` if Vertex AI or ML inference fails.

---

### `app/api/api_v1/endpoints/patients.py` — Patient Endpoints

**`GET /api/v1/patients/me`** — `get_my_cases(current_user, db)`
Patient-facing endpoint. Returns the authenticated patient's own demographic info and list of visible clinical images (those marked `visible_to_patient=True`).

**`GET /api/v1/patients`** — `list_patients(current_user, db)`
PCP-facing. Returns a list of all patients assigned to the requesting physician, with summary statistics.

**`GET /api/v1/patients/{patient_id}`** — `get_patient(patient_id, current_user, db)`
PCP-facing. Returns full patient details and their complete clinical image history. Returns `HTTP 403` if the patient is not assigned to this physician.

**`GET /api/v1/patients/{patient_id}/images/{query_id}`** — `get_image_detail(patient_id, query_id, current_user, db)`
Returns detailed metadata for a single clinical image including a signed GCS URL. Enforces physician ownership.

**`PATCH /api/v1/patients/{patient_id}/images/{query_id}/visibility`** — `toggle_visibility(patient_id, query_id, payload, current_user, db)`
Toggles whether a clinical image is visible to the patient. Requires PCP role and ownership.

**`POST /api/v1/patients/{patient_id}/reassign`** — `reassign_physician(patient_id, payload, current_user, db)`
Admin-only. Moves a patient to a different physician within the same network.

---

### `app/api/api_v1/endpoints/feedback.py` — Relevance Feedback

**`POST /api/v1/feedback`** — `submit_feedback(payload, current_user, db)`
Requires PCP role. Submits or updates a thumbs-up/thumbs-down rating on a specific reference atlas case for a given query. Uses upsert semantics — re-submitting updates the existing feedback rather than creating a duplicate. Validates that the query belongs to the requesting physician and that the reference image exists. Returns `HTTP 201` on success.

---

### `app/api/api_v1/endpoints/users.py` — User Management

**`GET /api/v1/users/me`** — `get_me(current_user)`
Returns the authenticated user's own profile.

**`PATCH /api/v1/users/me/password`** — `change_password(payload, current_user, db)`
Changes the authenticated user's password. Requires the current password to be provided for verification.

**`GET /api/v1/users`** — `list_users(current_user, db)`
Admin-only. Returns all users in the admin's network.

**`PATCH /api/v1/users/{user_id}/status`** — `set_user_status(user_id, payload, current_user, db)`
Admin-only. Activates or deactivates a user account.

---

### `app/api/api_v1/endpoints/audit_logs.py` — Audit Logs

**`GET /api/v1/audit-logs`** — `list_audit_logs(current_user, db)`
Admin-only. Returns paginated audit log entries for the network (LOGIN, UPLOAD, ANALYZE, FEEDBACK actions).

---

### `app/services/ml_service.py` — ML Inference Pipeline

**`SkinLesionMLP`** (class, `nn.Module`)
Two-hidden-layer MLP (1408 → hidden1 → hidden2 → 6 classes) with ReLU activations and dropout. Architecture parameters are loaded from a config file stored in GCS alongside the model weights. Produces a 6-class softmax probability distribution over: `mel` (melanoma), `nv` (nevus), `bcc` (basal cell carcinoma), `akiec` (actinic keratosis), `bkl` (benign keratosis), `df` (dermatofibroma).

**`run_inference(embedding, neighbor_distances, age, sex, localization) -> MLResult`**
Main inference entry point. Loads the MLP and XGBoost models from GCS on first call (cached in memory thereafter). Runs the MLP on the 1408-D embedding to get per-class probabilities, then feeds those probabilities along with patient demographics and KNN statistics into XGBoost to produce a binary malignancy probability and a calibrated risk flag.

---

### `app/core/gcs.py` — GCS Utilities

**`sign_gcs_uri(gcs_uri: str) -> str`**
Converts a `gs://bucket/path` URI into a time-limited HTTPS signed URL for browser-accessible image display.

---

## Database Models (`app/models/`)

| Model | Table | Key Fields |
|-------|-------|-----------|
| `User` | `users` | `user_id`, `email`, `password_hash`, `full_name`, `role` (PCP/PATIENT), `npi_number`, `network_id`, `is_admin`, `last_login_at` |
| `Network` | `networks` | `network_id`, `name`, `slug` |
| `Patient` | `patients` | `patient_id`, `primary_physician_id` → User, `mrn_internal`, `date_of_birth`, `gender` |
| `ClinicalImage` | `clinical_images` | `query_id` (UUID PK), `user_id` → User, `patient_id` → Patient, `gcs_image_uri`, `lesion_location`, `clinician_notes`, `visible_to_patient` |
| `ReferenceAtlas` | `reference_atlas` | `reference_id`, `gcs_image_uri`, `vertex_vector_id`, `diagnosis_label`, `diagnosis_type`, `modality`, `body_part`, `source_dataset` |
| `RecommendationFeedback` | `recommendation_feedback` | `feedback_id`, `query_id` → ClinicalImage, `reference_id` → ReferenceAtlas, `user_id` → User, `is_helpful`, unique on (query_id, reference_id, user_id) |
| `ClinicalImagePrediction` | `clinical_image_predictions` | `query_id` → ClinicalImage, `model_version`, `predicted_probs` (JSON), `risk_flag`, `primary_diagnosis`, `mel_probability`, `bcc_probability`, `inference_time_ms` |
| `AuditLog` | `audit_logs` | `log_id`, `user_id` → User, `action`, `target_resource`, `timestamp` |

---

## Frontend — Key Services (`client/services/`)

| Service | File | Responsibility |
|---------|------|---------------|
| Auth | `auth-service.ts` | Login, register network, store/clear JWT in state |
| Upload | `upload-service.ts` | POST multipart image upload to `/api/v1/upload/image` |
| Lesion | `lesion-service.ts` | POST to `/api/v1/lesion/analyze`, parse benign/malignant result lists |
| Patient | `patient-service.ts` | List patients, fetch patient detail and image history |
| Feedback | `feedback-service.ts` | POST thumbs-up/down feedback to `/api/v1/feedback` |
| Audit | `audit-service.ts` | Fetch audit log entries for admin view |
| User | `user-service.ts` | Fetch/update user profile, change password, admin user management |

---

## Frontend — Key Screens (`client/app/`)

| Screen | File | Description |
|--------|------|-------------|
| Login | `index.tsx` | Email/password login form |
| Register | `register.tsx` | Network registration form |
| Upload | `upload.tsx` | Patient selector, image picker, lesion location, upload submission |
| Compare | `compare.tsx` | Side-by-side benign/malignant reference atlas viewer, ML risk signal |
| Feedback | `feedback.tsx` | Thumbs-up/down rating for reference cases |
| My Cases | `my-cases.tsx` | Patient's own visible images |
| My Uploads | `my-uploads.tsx` | PCP's uploaded images with analysis status |
| Profile | `profile.tsx` | User profile and password change |
| Admin | `admin/` | User list, patient reassignment, account status management |
