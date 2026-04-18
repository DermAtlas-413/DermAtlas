"""
Shared async fixtures for the DermAtlas test suite.

Engine strategy:
  - Uses aiosqlite in-memory database so no real Postgres/Cloud SQL is needed.
  - The get_db dependency is overridden on the FastAPI app so every request
    receives the same transactional session that is rolled back after each test.
  - app.lifespan is replaced to skip init_db_engine() / close_db_engine().
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from unittest.mock import MagicMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from tests.fixtures.test_data import (
    BENIGN_DIAGNOSIS_LABEL,
    BENIGN_DIAGNOSIS_TYPE,
    BENIGN_REF_GCS_URI,
    BENIGN_REF_VERTEX_ID,
    CLINICIAN_NOTES,
    DIAGNOSIS_LABEL,
    DIAGNOSIS_TYPE,
    GCS_URI,
    LESION_LOCATION,
    OTHER_PCP_EMAIL,
    OTHER_PCP_FULL_NAME,
    OTHER_PCP_NPI,
    OTHER_PCP_PASSWORD,
    PATIENT_DOB,
    PATIENT_EMAIL,
    PATIENT_FULL_NAME,
    PATIENT_GENDER,
    PATIENT_MRN,
    PATIENT_PASSWORD,
    PCP_EMAIL,
    PCP_FULL_NAME,
    PCP_NPI,
    PCP_PASSWORD,
    REF_GCS_URI,
    REF_VERTEX_ID,
    VERTEX_VECTOR_ID,
    make_jpeg_bytes,
)


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session")
async def engine():
    """
    Session-scoped in-memory SQLite async engine.
    Tables are created once and torn down at session end.
    """
    # Import Base after models are imported so metadata is populated
    from app.db.base import Base  # noqa: F401 – ensure all models are registered
    import app.models  # noqa: F401 – register ORM models

    _engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield _engine
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await _engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Function-scoped session that is always rolled back, keeping tests isolated.
    """
    factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with factory() as session:
        async with session.begin():
            yield session
            await session.rollback()


# ---------------------------------------------------------------------------
# FastAPI app / HTTP client fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTPX AsyncClient with a no-op lifespan and the get_db dependency overridden
    to use the test's db_session.
    """
    from app.main import app
    from app.db import get_db

    @asynccontextmanager
    async def noop_lifespan(_app):
        yield

    app.router.lifespan_context = noop_lifespan

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth utility helpers
# ---------------------------------------------------------------------------


def _hash_password(plain: str) -> str:
    """Hash a plaintext password using the app's auth utility."""
    from app.core.auth import get_password_hash

    return get_password_hash(plain)


def _create_token(user_id: int, role: str) -> str:
    """Create a signed JWT for the given user/role."""
    from app.core.auth import create_access_token

    return create_access_token({"sub": str(user_id), "role": role})


# ---------------------------------------------------------------------------
# User fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def pcp_user(db_session: AsyncSession):
    """Insert a PCP user and return the ORM instance."""
    from app.models.user import User, UserRole

    user = User(
        email=PCP_EMAIL,
        password_hash=_hash_password(PCP_PASSWORD),
        full_name=PCP_FULL_NAME,
        role=UserRole.PCP,
        npi_number=PCP_NPI,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def patient_user(db_session: AsyncSession):
    """Insert a PATIENT user and return the ORM instance."""
    from app.models.user import User, UserRole

    user = User(
        email=PATIENT_EMAIL,
        password_hash=_hash_password(PATIENT_PASSWORD),
        full_name=PATIENT_FULL_NAME,
        role=UserRole.PATIENT,
        npi_number=None,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def other_pcp_user(db_session: AsyncSession):
    """A second PCP user unrelated to the patient_record fixture."""
    from app.models.user import User, UserRole

    user = User(
        email=OTHER_PCP_EMAIL,
        password_hash=_hash_password(OTHER_PCP_PASSWORD),
        full_name=OTHER_PCP_FULL_NAME,
        role=UserRole.PCP,
        npi_number=OTHER_PCP_NPI,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


# ---------------------------------------------------------------------------
# Patient / image fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def patient_record(db_session: AsyncSession, pcp_user):
    """Insert a Patient row owned by pcp_user."""
    from app.models.patient import Patient

    patient = Patient(
        primary_physician_id=pcp_user.user_id,
        mrn_internal=PATIENT_MRN,
        date_of_birth=PATIENT_DOB,
        gender=PATIENT_GENDER,
    )
    db_session.add(patient)
    await db_session.flush()
    await db_session.refresh(patient)
    return patient


@pytest_asyncio.fixture
async def clinical_image(db_session: AsyncSession, pcp_user, patient_record):
    """Insert a ClinicalImage row owned by pcp_user."""
    from app.models.clinical_image import ClinicalImage

    image = ClinicalImage(
        user_id=pcp_user.user_id,
        patient_id=patient_record.patient_id,
        gcs_image_uri=GCS_URI,
        vertex_vector_id=VERTEX_VECTOR_ID,
        lesion_location=LESION_LOCATION,
        clinician_notes=CLINICIAN_NOTES,
    )
    db_session.add(image)
    await db_session.flush()
    await db_session.refresh(image)
    return image


@pytest_asyncio.fixture
async def reference_image(db_session: AsyncSession):
    """Insert a malignant ReferenceAtlas row (kept for backwards-compat with existing tests)."""
    from app.models.reference_atlas import ReferenceAtlas

    ref = ReferenceAtlas(
        gcs_image_uri=REF_GCS_URI,
        vertex_vector_id=REF_VERTEX_ID,
        diagnosis_label=DIAGNOSIS_LABEL,
        diagnosis_type=DIAGNOSIS_TYPE,
        modality="dermoscopy",
        body_part="skin",
        source_dataset="ISIC",
    )
    db_session.add(ref)
    await db_session.flush()
    await db_session.refresh(ref)
    return ref


@pytest_asyncio.fixture
async def benign_reference_image(db_session: AsyncSession):
    """Insert a benign ReferenceAtlas row."""
    from app.models.reference_atlas import ReferenceAtlas

    ref = ReferenceAtlas(
        gcs_image_uri=BENIGN_REF_GCS_URI,
        vertex_vector_id=BENIGN_REF_VERTEX_ID,
        diagnosis_label=BENIGN_DIAGNOSIS_LABEL,
        diagnosis_type=BENIGN_DIAGNOSIS_TYPE,
        modality="dermoscopy",
        body_part="skin",
        source_dataset="ISIC",
    )
    db_session.add(ref)
    await db_session.flush()
    await db_session.refresh(ref)
    return ref


@pytest_asyncio.fixture
async def malignant_reference_image(reference_image):
    """Alias for reference_image — the default reference fixture is malignant."""
    return reference_image


# ---------------------------------------------------------------------------
# Token / auth header fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def pcp_token(pcp_user) -> dict:
    """Return an Authorization header dict for the PCP user."""
    token = _create_token(pcp_user.user_id, "PCP")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def patient_token(patient_user) -> dict:
    """Return an Authorization header dict for the patient user."""
    token = _create_token(patient_user.user_id, "PATIENT")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def other_pcp_token(other_pcp_user) -> dict:
    """Return an Authorization header dict for the unrelated PCP user."""
    token = _create_token(other_pcp_user.user_id, "PCP")
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Test data fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_jpeg_bytes() -> bytes:
    """1×1 pixel JPEG bytes."""
    return make_jpeg_bytes()


# ---------------------------------------------------------------------------
# External service mock fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_gcs(mocker):
    """Patch the GCS client used in the upload service."""
    mock = mocker.patch("google.cloud.storage.Client")
    bucket = mock.return_value.bucket.return_value
    blob = bucket.blob.return_value
    blob.public_url = GCS_URI
    blob.upload_from_file.return_value = None
    return mock


@pytest.fixture
def mock_vertex(mocker):
    """Patch the Vertex AI vector search endpoint AND the multimodal embedding model.

    The analyze endpoint calls both:
      - `vertexai.vision_models.MultiModalEmbeddingModel.from_pretrained(...).get_embeddings(...)`
        to embed the uploaded image
      - `google.cloud.aiplatform.MatchingEngineIndexEndpoint(...).find_neighbors(...)`
        to query the vector index
    Both must be mocked to keep tests offline and deterministic.
    """
    mocker.patch("vertexai.init")
    embed_model_cls = mocker.patch(
        "app.api.api_v1.endpoints.lesion.MultiModalEmbeddingModel"
    )
    embedding_result = MagicMock()
    embedding_result.image_embedding = [0.0] * 1408
    embed_model_cls.from_pretrained.return_value.get_embeddings.return_value = embedding_result

    mock = mocker.patch("google.cloud.aiplatform.MatchingEngineIndexEndpoint")
    endpoint = mock.return_value
    endpoint.find_neighbors.return_value = [[]]  # empty neighbour list by default
    return mock
