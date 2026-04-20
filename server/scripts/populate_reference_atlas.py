"""
Populate the reference_atlas table from the vector search index metadata.

Maps vector search IDs (image_0, image_1, ...) to ISIC image IDs and their
metadata from unified_metadata.csv, then inserts rows into reference_atlas
so the analyze endpoint can return diagnosis labels and image URIs.

Requires:
  - cloud-sql-proxy running on port 15432
  - /tmp/image_ids.npy (from gs://dermatlas-ml-data/processed/image_ids.npy)
  - /tmp/unified_metadata.csv (from gs://dermatlas-ml-data/processed/unified_metadata.csv)
  - /tmp/ham_part1.txt (listing of HAM10000 part_1 images)

Usage:
  cd server && source venv/bin/activate
  python scripts/populate_reference_atlas.py
"""

import asyncio
import csv
import os
import sys
from pathlib import Path

import numpy as np

# ---- Config ----
DB_HOST = "127.0.0.1"
DB_PORT = 15432
DB_USER = "postgres"
DB_PASS = "!Password123"
DB_NAME = "staging_db"

# Label columns in unified_metadata.csv → human-readable names
LABEL_MAP = {
    "mel": "Melanoma",
    "nv": "Melanocytic Nevus",
    "bcc": "Basal Cell Carcinoma",
    "akiec": "Actinic Keratosis",
    "bkl": "Benign Keratosis",
    "df": "Dermatofibroma",
}
LABEL_COLS = list(LABEL_MAP.keys())

# GCS base paths per source dataset
GCS_PATHS = {
    "ham10000_part1": "gs://dermatlas-ml-data/raw/HAM10000/HAM10000/HAM10000_images_part_1",
    "ham10000_part2": "gs://dermatlas-ml-data/raw/HAM10000/HAM10000/HAM10000_images_part_2",
    "isic2019": "gs://dermatlas-ml-data/raw/ISIC/ISIC/ISIC_2019_Training_Input/ISIC_2019_Training_Input",
    "isic2020": "gs://dermatlas-ml-data/raw/ISIC2020/train-image/image",
}


def load_ham_part1_ids() -> set[str]:
    """Load set of ISIC image IDs in HAM10000 part 1."""
    ids = set()
    with open("/tmp/ham_part1.txt") as f:
        for line in f:
            line = line.strip()
            if line and line.endswith(".jpg"):
                # Extract ISIC_XXXXXXX from the full GCS path
                fname = line.rsplit("/", 1)[-1].replace(".jpg", "")
                ids.add(fname)
    return ids


def get_gcs_uri(image_id: str, source_dataset: str, ham_part1: set[str]) -> str:
    """Determine the GCS URI for an image based on its source dataset."""
    if source_dataset == "ham10000":
        if image_id in ham_part1:
            return f"{GCS_PATHS['ham10000_part1']}/{image_id}.jpg"
        else:
            return f"{GCS_PATHS['ham10000_part2']}/{image_id}.jpg"
    elif source_dataset == "isic2019":
        return f"{GCS_PATHS['isic2019']}/{image_id}.jpg"
    elif source_dataset == "isic2020":
        return f"{GCS_PATHS['isic2020']}/{image_id}.jpg"
    else:
        return f"gs://dermatlas-ml-data/raw/{source_dataset}/{image_id}.jpg"


def get_diagnosis_label(row: dict) -> str:
    """Get human-readable diagnosis from one-hot columns."""
    for col in LABEL_COLS:
        if row.get(col) == "1":
            return LABEL_MAP[col]
    return "Unknown"


def get_diagnosis_type(row: dict) -> str:
    """Determine benign/malignant from the metadata."""
    if row.get("malignant") == "1":
        return "Malignant"
    return "Benign"


async def main():
    import asyncpg

    # Load image IDs mapping (index → ISIC image ID)
    image_ids = np.load("/tmp/image_ids.npy", allow_pickle=True)
    print(f"Loaded {len(image_ids)} image IDs from image_ids.npy")

    # Load unified metadata into a dict keyed by image_id
    metadata: dict[str, dict] = {}
    with open("/tmp/unified_metadata.csv") as f:
        for row in csv.DictReader(f):
            metadata[row["image_id"]] = row
    print(f"Loaded {len(metadata)} metadata entries")

    # Load HAM10000 part 1 IDs
    ham_part1 = load_ham_part1_ids()
    print(f"HAM10000 part 1 has {len(ham_part1)} images")

    # Connect to database
    conn = await asyncpg.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASS, database=DB_NAME
    )
    print("Connected to database")

    # Check if table already has data
    count = await conn.fetchval("SELECT COUNT(*) FROM reference_atlas")
    if count > 0:
        print(f"reference_atlas already has {count} rows. Truncating...")
        await conn.execute("TRUNCATE TABLE reference_atlas CASCADE")

    # Build rows in batches
    BATCH_SIZE = 1000
    total_inserted = 0
    batch = []

    for idx, isic_id in enumerate(image_ids):
        isic_id = str(isic_id)
        vector_id = f"image_{idx}"
        meta = metadata.get(isic_id, {})

        gcs_uri = get_gcs_uri(isic_id, meta.get("source_dataset", "unknown"), ham_part1)
        diagnosis_label = get_diagnosis_label(meta)
        diagnosis_type = get_diagnosis_type(meta)
        body_part = meta.get("localization", "unknown")
        modality = meta.get("dx_type", "unknown")
        source_dataset = meta.get("source_dataset", "unknown")

        batch.append((
            vector_id,      # reference_id (matches vector search ID)
            gcs_uri,        # gcs_image_uri
            vector_id,      # vertex_vector_id
            diagnosis_label,
            diagnosis_type,
            modality,
            body_part,
            source_dataset,
        ))

        if len(batch) >= BATCH_SIZE:
            await conn.executemany(
                """INSERT INTO reference_atlas
                   (reference_id, gcs_image_uri, vertex_vector_id,
                    diagnosis_label, diagnosis_type, modality, body_part, source_dataset)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                batch,
            )
            total_inserted += len(batch)
            print(f"  Inserted {total_inserted}/{len(image_ids)} rows...")
            batch = []

    # Insert remaining
    if batch:
        await conn.executemany(
            """INSERT INTO reference_atlas
               (reference_id, gcs_image_uri, vertex_vector_id,
                diagnosis_label, diagnosis_type, modality, body_part, source_dataset)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
            batch,
        )
        total_inserted += len(batch)

    print(f"Done! Inserted {total_inserted} rows into reference_atlas")

    # Verify
    sample = await conn.fetch("SELECT * FROM reference_atlas LIMIT 3")
    for row in sample:
        print(f"  {dict(row)}")

    await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
