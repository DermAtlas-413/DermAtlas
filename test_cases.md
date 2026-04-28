# Test Cases

## Overview

DermAtlas uses a TDD (test-driven development) approach. All backend tests live in `server/tests/`. Tests are split into:

- **Unit tests** (`tests/unit/`) — test isolated components (config, schemas, auth utilities, session management)
- **Integration tests** (`tests/integration/`) — test full HTTP request/response cycles against an in-memory SQLite database

Tests use `httpx.AsyncClient` with an `aiosqlite` in-memory database. GCS and Vertex AI are patched so no cloud credentials are required to run tests.

### Running the Tests

```bash
cd server
source venv/bin/activate

# Fast (no coverage gate)
ENV=testing pytest --no-cov

# Full run (enforces ≥80% coverage)
ENV=testing pytest
```

---

## Integration Tests

### Authentication — `tests/integration/test_auth.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_login_success_returns_access_token` | Valid PCP email + password | `200 OK`, response contains `access_token` and `token_type: bearer` |
| `test_login_pcp_token_includes_role` | Decode JWT from PCP login | Token payload contains `role: PCP` |
| `test_login_patient_token_includes_role` | Decode JWT from patient login | Token payload contains `role: PATIENT` |
| `test_login_wrong_password_returns_401` | Correct email, wrong password | `401 Unauthorized` |
| `test_login_unknown_email_returns_401` | Non-existent user | `401 Unauthorized` (no email enumeration) |
| `test_login_missing_email_returns_422` | Password provided, username missing | `422 Unprocessable Entity` |
| `test_login_empty_fields_returns_422` | Both fields empty | `422 Unprocessable Entity` |

---

### Image Upload — `tests/integration/test_upload.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_upload_jpeg_returns_201_with_query_id` | Valid JPEG, valid patient, GCS mocked | `201 Created`, response contains `query_id` UUID |
| `test_upload_png_returns_201` | Valid PNG upload | `201 Created` |
| `test_upload_creates_clinical_image_db_record` | Upload a JPEG | A `ClinicalImage` row exists in the DB with matching fields |
| `test_upload_wrong_file_type_returns_400` | Upload a `.txt` file | `400 Bad Request` |
| `test_upload_empty_file_returns_400` | Upload a 0-byte file | `400 Bad Request` |
| `test_upload_file_too_large_returns_413` | Upload file > 10 MB | `413 Request Entity Too Large` |
| `test_upload_no_auth_returns_401` | No Authorization header | `401 Unauthorized` |
| `test_upload_patient_role_returns_403` | Upload with patient token | `403 Forbidden` (PCP role required) |
| `test_upload_wrong_patient_returns_403` | Patient belongs to a different PCP | `403 Forbidden` |
| `test_upload_nonexistent_patient_returns_404` | `patient_id` does not exist | `404 Not Found` |
| `test_upload_gcs_failure_returns_503` | GCS client raises exception | `503 Service Unavailable` |

---

### Lesion Analysis — `tests/integration/test_analyze.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_analyze_returns_benign_and_malignant_lists` | Valid query_id, Vertex mocked | `200 OK`, response contains `benign_results` and `malignant_results` lists |
| `test_analyze_limits_to_top_5_per_category` | Vertex returns > 5 per category | Each list capped at 5 items |
| `test_analyze_results_contain_required_fields` | Run analysis | Each result item contains `reference_id`, `diagnosis_label`, `diagnosis_type`, `score` |
| `test_analyze_no_auth_returns_401` | No token | `401 Unauthorized` |
| `test_analyze_patient_role_returns_403` | Patient token | `403 Forbidden` |
| `test_analyze_wrong_owner_returns_403` | Other PCP's query_id | `403 Forbidden` |
| `test_analyze_nonexistent_query_returns_404` | Nonexistent query_id | `404 Not Found` |
| `test_analyze_vertex_failure_returns_503` | Vertex raises exception | `503 Service Unavailable` |

---

### Relevance Feedback — `tests/integration/test_feedback.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_feedback_helpful_true_returns_201` | Submit `is_helpful=True` | `201 Created` |
| `test_feedback_helpful_false_returns_201` | Submit `is_helpful=False` | `201 Created` |
| `test_feedback_record_saved_to_db` | Submit helpful feedback | A `RecommendationFeedback` row exists in DB with `is_helpful=True` |
| `test_feedback_no_auth_returns_401` | No token | `401 Unauthorized` |
| `test_feedback_patient_role_returns_403` | Patient token | `403 Forbidden` |
| `test_feedback_invalid_query_id_returns_404` | Non-existent `query_id` | `404 Not Found` |
| `test_feedback_invalid_reference_id_returns_404` | Non-existent `reference_id` | `404 Not Found` |
| `test_feedback_missing_is_helpful_returns_422` | Body missing `is_helpful` | `422 Unprocessable Entity` |
| `test_feedback_missing_query_id_returns_422` | Body missing `query_id` | `422 Unprocessable Entity` |
| `test_feedback_missing_reference_id_returns_422` | Body missing `reference_id` | `422 Unprocessable Entity` |
| `test_feedback_for_other_physicians_query_returns_403` | Other PCP submitting feedback on another PCP's query | `403 Forbidden` |
| `test_feedback_duplicate_updates_existing_record` | Submit feedback twice for same (query, reference) | Only 1 DB row, `is_helpful` updated to latest value |
| `test_feedback_creates_audit_log` | Submit feedback | An `AuditLog` row with `action=FEEDBACK` exists in DB |

---

### Patient Access — `tests/integration/test_patients.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_get_patient_returns_200` | PCP fetches own patient | `200 OK` |
| `test_get_patient_response_includes_demographics` | Fetch patient | Response contains `mrn_internal`, `date_of_birth`, `gender` |
| `test_get_patient_response_includes_clinical_images_list` | Patient has an uploaded image | Response contains `clinical_images` list with ≥ 1 item |
| `test_get_patient_images_have_correct_fields` | Patient image list | Each image has `query_id`, `gcs_uri`, `captured_at`, `lesion_location` |
| `test_get_patient_no_auth_returns_401` | No token | `401 Unauthorized` |
| `test_get_patient_patient_role_returns_403` | Patient token | `403 Forbidden` |
| `test_get_patient_other_pcp_returns_403` | PCP fetches another PCP's patient | `403 Forbidden` |
| `test_get_patient_nonexistent_returns_404` | Non-existent `patient_id` | `404 Not Found` |
| `test_get_patient_creates_audit_log` | Fetch patient | `AuditLog` entry with `action=VIEW_PATIENT` created |

---

### Health Check — `tests/integration/test_health.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_health_returns_200` | `GET /api/v1/health` | `200 OK` |
| `test_health_response_has_status_ok` | Health check body | Response contains `{"status": "ok"}` |

---

### Multi-Tenancy (Networks) — `tests/integration/test_networks.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_register_network_returns_201_with_token` | Valid registration payload | `201 Created`, response contains `access_token` |
| `test_register_network_duplicate_name_returns_409` | Same network name twice | `409 Conflict` |
| `test_register_network_duplicate_email_returns_409` | Same admin email twice | `409 Conflict` |
| `test_pcp_from_network_a_cannot_see_network_b_patients` | Cross-network patient access | `403 Forbidden` |

---

## Unit Tests

### Config — `tests/unit/test_config.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_settings_loads_from_env` | Set env var and load Settings | Setting value matches env var |
| `test_settings_missing_required_raises` | Missing `DATABASE_URL` in non-test mode | `ValidationError` raised |
| `test_testing_env_bypasses_db_url_check` | `ENV=testing` | No error even without `DATABASE_URL` |

---

### Auth Utilities — `tests/unit/test_auth_utils.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_get_password_hash_returns_non_plaintext` | Hash `"secret"` | Returned string does not equal `"secret"` |
| `test_verify_password_correct_returns_true` | Hash then verify same password | Returns `True` |
| `test_verify_password_wrong_returns_false` | Hash one password, verify with different | Returns `False` |
| `test_create_access_token_roundtrip` | Create token, decode it | Decoded payload contains the original claims |
| `test_expired_token_raises` | Create token with 0-second expiry | `jose.ExpiredSignatureError` raised on decode |
| `test_tampered_token_raises` | Modify a valid token string | `jose.JWTError` raised on decode |

---

### Schemas — `tests/unit/test_schemas.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_token_response_valid` | Construct `TokenResponse` with access_token | Object created successfully |
| `test_analyze_request_requires_query_id` | Omit `query_id` from `AnalyzeRequest` | `ValidationError` raised |
| `test_feedback_request_requires_all_fields` | Omit `is_helpful` from `FeedbackRequest` | `ValidationError` raised |
| `test_feedback_request_is_helpful_must_be_bool` | Pass string `"yes"` for `is_helpful` | `ValidationError` raised |

---

### Session / DB — `tests/unit/test_session.py`

| Test | Description | Expected Result |
|------|-------------|-----------------|
| `test_get_db_yields_session` | Call `get_db` dependency | Yields a valid `AsyncSession` |
| `test_session_is_rolled_back_after_exception` | Raise inside a session context | Session rolls back; DB unchanged |

---

## Testing GCP-Backed Features (Mocked)

All GCS and Vertex AI calls are patched in tests using `pytest-mock` fixtures defined in `tests/conftest.py`:

- **`mock_gcs`** — patches `google.cloud.storage.Client` so no real GCS bucket is accessed.
- **`mock_vertex`** — patches `google.cloud.aiplatform.MatchingEngineIndexEndpoint` so no real vector search is performed. Tests supply controlled neighbor lists to verify business logic independently of the embedding model.

To run tests with real GCP credentials (optional, for end-to-end validation):

```bash
gcloud auth application-default login
# Set GCP_PROJECT_ID, GCS_BUCKET_NAME, VERTEX_AI_INDEX_ENDPOINT in server/.env
ENV=development pytest tests/integration/test_analyze.py --no-cov
```

---

## Coverage Gate

`server/pytest.ini` enforces `--cov-fail-under=80`. The full test suite will fail if line coverage drops below 80%. Use `--no-cov` to skip coverage for quick iteration.

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
addopts = --cov=app --cov-report=term-missing --cov-fail-under=80
```
