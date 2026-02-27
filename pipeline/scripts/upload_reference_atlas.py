import os
import sys
import mimetypes
from dataclasses import dataclass
from typing import Optional, Dict, Any

import pandas as pd
from tqdm import tqdm
from dotenv import load_dotenv

from google.cloud import storage

try:
    import psycopg2
    import psycopg2.extras
except Exception:
    psycopg2 = None


REQUIRED_COLS = ["image_id", "local_path", "source_dataset"]


@dataclass
class Settings:
    gcp_project_id: str
    gcs_bucket_reference: str
    gcs_prefix_reference: str

    use_cloud_sql: bool
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_pass: str


def load_settings() -> Settings:
    load_dotenv("pipeline/.env")  # assumes run from repo root

    def req(name: str) -> str:
        v = os.getenv(name)
        if not v:
            raise RuntimeError(f"Missing env var: {name}")
        return v

    return Settings(
        gcp_project_id=req("GCP_PROJECT_ID"),
        gcs_bucket_reference=req("GCS_BUCKET_REFERENCE"),
        gcs_prefix_reference=os.getenv("GCS_PREFIX_REFERENCE", "reference"),
        use_cloud_sql=os.getenv("USE_CLOUD_SQL", "false").lower() == "true",
        db_host=os.getenv("DB_HOST", "127.0.0.1"),
        db_port=int(os.getenv("DB_PORT", "5432")),
        db_name=os.getenv("DB_NAME", "dermatlas"),
        db_user=os.getenv("DB_USER", "postgres"),
        db_pass=os.getenv("DB_PASS", "postgres"),
    )


def validate_manifest(df: pd.DataFrame) -> None:
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise ValueError(f"Manifest missing required columns: {missing}")

    # Basic sanity checks
    if df["image_id"].isna().any():
        raise ValueError("Manifest has empty image_id values.")
    if df["local_path"].isna().any():
        raise ValueError("Manifest has empty local_path values.")
    if df["source_dataset"].isna().any():
        raise ValueError("Manifest has empty source_dataset values.")


def guess_ext(path: str) -> str:
    _, ext = os.path.splitext(path)
    ext = ext.lower()
    return ext if ext else ".jpg"


def build_gcs_object_name(prefix: str, source_dataset: str, image_id: str, local_path: str) -> str:
    ext = guess_ext(local_path)
    # e.g. reference/isic/abc123.jpg
    return f"{prefix}/{source_dataset.strip().lower()}/{image_id}{ext}"


def upload_file_if_needed(bucket: storage.Bucket, local_path: str, object_name: str) -> str:
    blob = bucket.blob(object_name)

    # Skip if already exists
    if blob.exists():
        return f"gs://{bucket.name}/{object_name}"

    # Upload
    content_type, _ = mimetypes.guess_type(local_path)
    blob.upload_from_filename(local_path, content_type=content_type)
    return f"gs://{bucket.name}/{object_name}"


def connect_pg(settings: Settings):
    if not psycopg2:
        raise RuntimeError("psycopg2 is not installed. Install psycopg2-binary.")
    return psycopg2.connect(
        host=settings.db_host,
        port=settings.db_port,
        dbname=settings.db_name,
        user=settings.db_user,
        password=settings.db_pass,
    )


def upsert_reference_atlas_row(conn, row: Dict[str, Any]) -> None:
    """
    Assumes a table like:
      Reference_Atlas(reference_id SERIAL PK, gcs_image_uri, vertex_vector_id, diagnosis_label, diagnosis_type,
                     modality, body_part, source_dataset, embedding_status, embedding_error, embedded_at, ...)
    We upsert by a unique key. If you don't have a unique key yet, create one:
      image_id VARCHAR UNIQUE
    If you don't have image_id column in SQL, add it (recommended).
    """
    # We strongly recommend having image_id UNIQUE in Reference_Atlas.
    # If your SQL schema doesn't include it yet, run upload-only for now.
    sql = """
    INSERT INTO Reference_Atlas (image_id, gcs_image_uri, diagnosis_label, diagnosis_type, modality, body_part, source_dataset, vertex_vector_id, embedding_status)
    VALUES (%(image_id)s, %(gcs_image_uri)s, %(diagnosis_label)s, %(diagnosis_type)s, %(modality)s, %(body_part)s, %(source_dataset)s, NULL, 'pending')
    ON CONFLICT (image_id)
    DO UPDATE SET
      gcs_image_uri = EXCLUDED.gcs_image_uri,
      diagnosis_label = COALESCE(EXCLUDED.diagnosis_label, Reference_Atlas.diagnosis_label),
      diagnosis_type = COALESCE(EXCLUDED.diagnosis_type, Reference_Atlas.diagnosis_type),
      modality = COALESCE(EXCLUDED.modality, Reference_Atlas.modality),
      body_part = COALESCE(EXCLUDED.body_part, Reference_Atlas.body_part),
      source_dataset = COALESCE(EXCLUDED.source_dataset, Reference_Atlas.source_dataset);
    """
    with conn.cursor() as cur:
        cur.execute(sql, row)


def main():
    if len(sys.argv) < 2:
        print("Usage: python pipeline/scripts/upload_reference_atlas.py /path/to/manifest.csv")
        sys.exit(1)

    manifest_path = sys.argv[1]
    settings = load_settings()

    df = pd.read_csv(manifest_path)
    validate_manifest(df)

    # Create GCS client/bucket
    storage_client = storage.Client(project=settings.gcp_project_id)
    bucket = storage_client.bucket(settings.gcs_bucket_reference)

    # Optional SQL connection
    conn = None
    if settings.use_cloud_sql:
        conn = connect_pg(settings)
        conn.autocommit = False

    uploaded = 0
    skipped_or_existing = 0
    failed = 0

    # Normalize optional columns existence
    optional_cols = ["diagnosis_label", "diagnosis_type", "modality", "body_part"]
    for c in optional_cols:
        if c not in df.columns:
            df[c] = None

    try:
        for _, r in tqdm(df.iterrows(), total=len(df), desc="Uploading"):
            image_id = str(r["image_id"])
            local_path = str(r["local_path"])
            source_dataset = str(r["source_dataset"])

            if not os.path.exists(local_path):
                failed += 1
                print(f"[MISSING FILE] {local_path}")
                continue

            object_name = build_gcs_object_name(
                settings.gcs_prefix_reference, source_dataset, image_id, local_path
            )

            # Upload (or skip if exists)
            before_exists = bucket.blob(object_name).exists()
            gcs_uri = upload_file_if_needed(bucket, local_path, object_name)
            if before_exists:
                skipped_or_existing += 1
            else:
                uploaded += 1

            if settings.use_cloud_sql:
                row = {
                    "image_id": image_id,
                    "gcs_image_uri": gcs_uri,
                    "diagnosis_label": r.get("diagnosis_label"),
                    "diagnosis_type": r.get("diagnosis_type"),
                    "modality": r.get("modality"),
                    "body_part": r.get("body_part"),
                    "source_dataset": source_dataset,
                }
                upsert_reference_atlas_row(conn, row)

        if conn:
            conn.commit()

    except Exception as e:
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

    print("\n=== Summary ===")
    print(f"Uploaded new:        {uploaded}")
    print(f"Already existed:     {skipped_or_existing}")
    print(f"Failed (missing/err):{failed}")
    print("Done.")


if __name__ == "__main__":
    main() 