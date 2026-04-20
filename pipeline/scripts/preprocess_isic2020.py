"""
Preprocess ISIC 2020 dataset and upload to GCS.

Reads train.csv from the siim-isic-melanoma-classification Kaggle competition,
maps diagnoses to our 6-class schema, uploads images and ground truth CSV to GCS.

ISIC 2020 label mapping:
  melanoma                        -> mel
  nevus                           -> nv
  seborrheic keratosis            -> bkl
  lentigo NOS                     -> bkl
  lichenoid keratosis             -> bkl
  solar lentigo                   -> bkl
  cafe-au-lait macule             -> skip (not in 6-class schema)
  atypical melanocytic proliferation -> skip (ambiguous)
  unknown                         -> skip

Note: ISIC 2020 has no bcc, akiec, or df cases. It adds mel, nv, and bkl.

Expected local directory structure after Kaggle download:
  data/isic2020/
  ├── train.csv
  ├── test.csv
  └── jpeg/
      └── train/
          ├── ISIC_2637011.jpg
          └── ...

Output (GCS):
  gs://dermatlas-ml-data/raw/ISIC2020/ISIC_2020_Training_Input/<image>.jpg
  gs://dermatlas-ml-data/raw/ISIC2020/ISIC_2020_Training_GroundTruth.csv

Usage (run from repo root on the GCP VM):
    python pipeline/scripts/preprocess_isic2020.py

    # Dry run — show what would be uploaded without uploading
    python pipeline/scripts/preprocess_isic2020.py --dry-run

    # Custom local data directory
    python pipeline/scripts/preprocess_isic2020.py --data-dir /path/to/isic2020
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
from google.cloud import storage
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET       = "dermatlas-ml-data"
GCS_IMAGE_PREFIX = "raw/ISIC2020/ISIC_2020_Training_Input"
GCS_CSV_PATH     = "raw/ISIC2020/ISIC_2020_Training_GroundTruth.csv"

TARGET_CLASSES   = ["mel", "nv", "bcc", "akiec", "bkl", "df"]

# ISIC 2020 diagnosis -> our class name (None = skip this row)
LABEL_MAP = {
    "melanoma":                          "mel",
    "nevus":                             "nv",
    "seborrheic keratosis":              "bkl",
    "lentigo NOS":                       "bkl",
    "lichenoid keratosis":               "bkl",
    "solar lentigo":                     "bkl",
    "cafe-au-lait macule":               None,   # not in schema
    "atypical melanocytic proliferation": None,  # ambiguous
    "unknown":                           None,
}


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Preprocess + upload ISIC 2020 to GCS")
    parser.add_argument(
        "--data-dir",
        default="data/isic2020",
        help="Local directory containing train.csv and jpeg/train/",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without uploading anything",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=8,
        help="Parallel upload threads",
    )
    return parser.parse_args()


# ── Label processing ──────────────────────────────────────────────────────────
def process_ground_truth(csv_path: str) -> pd.DataFrame:
    """
    Read train.csv, map diagnoses to 6-class schema, one-hot encode.
    Returns DataFrame with columns [image_id, mel, nv, bcc, akiec, bkl, df].
    """
    print(f"\n=== Processing ground truth: {csv_path} ===")
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows")
    print(f"Columns: {list(df.columns)}")

    # Normalize column name — competition uses 'image_name', we use 'image_id'
    if "image_name" in df.columns and "image_id" not in df.columns:
        df = df.rename(columns={"image_name": "image_id"})

    # Show raw diagnosis distribution
    if "diagnosis" in df.columns:
        print("\nRaw diagnosis distribution:")
        for diag, count in df["diagnosis"].value_counts().items():
            mapped = LABEL_MAP.get(str(diag).lower(), "UNKNOWN")
            print(f"  {diag:45s}: {count:5d}  -> {mapped}")
    else:
        # Some versions only have binary target (0/1), no diagnosis column
        # Fall back to target column: 1=melanoma, 0=nevus (majority benign)
        print("⚠️  No 'diagnosis' column found — using binary 'target' column")
        df["diagnosis"] = df["target"].map({1: "melanoma", 0: "nevus"})

    # Map to our schema
    df["diagnosis_lower"] = df["diagnosis"].str.strip().str.lower()
    df["class_name"] = df["diagnosis_lower"].map(LABEL_MAP)

    # Filter out unmappable rows
    before = len(df)
    df = df[df["class_name"].notna()].copy()
    skipped = before - len(df)
    print(f"\nSkipped {skipped} rows (unmappable diagnoses)")
    print(f"Remaining: {len(df)} rows")

    # One-hot encode
    for cls in TARGET_CLASSES:
        df[cls] = (df["class_name"] == cls).astype(int)

    # Validate — every row should sum to exactly 1
    row_sums = df[TARGET_CLASSES].sum(axis=1)
    assert (row_sums == 1).all(), "Some rows don't sum to 1 after one-hot encoding"

    # Select final columns
    result = df[["image_id"] + TARGET_CLASSES].copy()

    print("\nFinal class distribution:")
    for cls in TARGET_CLASSES:
        count = int(result[cls].sum())
        pct = 100 * count / len(result) if len(result) > 0 else 0
        print(f"  {cls:6s}: {count:5d}  ({pct:.2f}%)")

    return result


# ── GCS upload ────────────────────────────────────────────────────────────────
def upload_csv(df: pd.DataFrame, dry_run: bool):
    """Upload the processed ground truth CSV to GCS."""
    if dry_run:
        print(f"\n[DRY RUN] Would upload ground truth CSV -> gs://{GCS_BUCKET}/{GCS_CSV_PATH}")
        return

    import io
    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(GCS_CSV_PATH)

    buf = io.StringIO()
    df.to_csv(buf, index=False)
    blob.upload_from_string(buf.getvalue(), content_type="text/csv")
    print(f"✓ Uploaded ground truth -> gs://{GCS_BUCKET}/{GCS_CSV_PATH}")


def upload_images(df: pd.DataFrame, image_dir: Path, dry_run: bool):
    """Upload all images in df to GCS, skipping ones that already exist."""
    print(f"\n=== Uploading {len(df)} images to GCS ===")

    if dry_run:
        # Just check which files exist locally
        missing = 0
        for image_id in df["image_id"]:
            p = image_dir / f"{image_id}.jpg"
            if not p.exists():
                missing += 1
        print(f"[DRY RUN] {len(df) - missing} files found locally, {missing} missing")
        print(f"[DRY RUN] Would upload to gs://{GCS_BUCKET}/{GCS_IMAGE_PREFIX}/")
        return 0, missing

    client = storage.Client()
    bucket = client.bucket(GCS_BUCKET)

    uploaded = 0
    skipped  = 0
    failed   = 0

    for image_id in tqdm(df["image_id"], desc="Uploading images"):
        local_path = image_dir / f"{image_id}.jpg"
        gcs_path   = f"{GCS_IMAGE_PREFIX}/{image_id}.jpg"

        if not local_path.exists():
            print(f"  ⚠️  Missing locally: {local_path}")
            failed += 1
            continue

        blob = bucket.blob(gcs_path)
        if blob.exists():
            skipped += 1
            continue

        try:
            blob.upload_from_filename(str(local_path), content_type="image/jpeg")
            uploaded += 1
        except Exception as e:
            print(f"  ❌ Failed {image_id}: {e}")
            failed += 1

    return uploaded, skipped, failed


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    data_dir  = Path(args.data_dir)
    csv_path  = data_dir / "train.csv"

    # ISIC 2020 Kaggle competition unzips images to jpeg/train/
    # but structure can vary — check both locations
    image_dir = data_dir / "jpeg" / "train"
    if not image_dir.exists():
        image_dir = data_dir / "train"
    if not image_dir.exists():
        print(f"❌ Cannot find image directory. Tried:")
        print(f"   {data_dir / 'jpeg' / 'train'}")
        print(f"   {data_dir / 'train'}")
        sys.exit(1)

    if not csv_path.exists():
        print(f"❌ train.csv not found at {csv_path}")
        sys.exit(1)

    print("=" * 60)
    print("ISIC 2020 Preprocessing + GCS Upload")
    print("=" * 60)
    print(f"Data dir:  {data_dir}")
    print(f"Image dir: {image_dir}")
    print(f"CSV:       {csv_path}")
    print(f"Target:    gs://{GCS_BUCKET}/{GCS_IMAGE_PREFIX}/")
    if args.dry_run:
        print("MODE: DRY RUN — nothing will be uploaded")

    # 1. Process ground truth
    df = process_ground_truth(str(csv_path))

    # 2. Upload CSV
    print("\n[1/2] Uploading ground truth CSV...")
    upload_csv(df, args.dry_run)

    # 3. Upload images
    print("\n[2/2] Uploading images...")
    if args.dry_run:
        upload_images(df, image_dir, dry_run=True)
    else:
        uploaded, skipped, failed = upload_images(df, image_dir, dry_run=False)
        print(f"\n{'='*60}")
        print(f"Upload complete!")
        print(f"  Uploaded new : {uploaded}")
        print(f"  Already existed (skipped): {skipped}")
        print(f"  Failed       : {failed}")
        print(f"  Total images : {len(df)}")
        print(f"\nGround truth : gs://{GCS_BUCKET}/{GCS_CSV_PATH}")
        print(f"Images       : gs://{GCS_BUCKET}/{GCS_IMAGE_PREFIX}/")
        print("=" * 60)


if __name__ == "__main__":
    main()
