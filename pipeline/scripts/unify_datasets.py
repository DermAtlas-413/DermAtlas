"""
Unify HAM10000 and ISIC 2019 datasets into a single metadata CSV.

Produces: unified_metadata.csv with columns [image_id, mel, nv, bcc, akiec, bkl, df]
Output: gs://dermatlas-ml-data/processed/unified_metadata.csv

Usage:
    python pipeline/scripts/unify_datasets.py
"""

import os
import sys
import pandas as pd
from pathlib import Path
from google.cloud import storage

# GCS paths
GCS_BUCKET = "dermatlas-ml-data"
HAM10000_METADATA = "raw/HAM10000/HAM10000/HAM10000_metadata.csv"
ISIC_2019_GROUNDTRUTH = "raw/ISIC/ISIC/ISIC_2019_Training_GroundTruth.csv"
OUTPUT_PATH = "processed/unified_metadata.csv"

# Target 6-class schema
TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]


def download_from_gcs(bucket_name: str, source_blob: str, dest_file: str):
    """Download a file from GCS."""
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(source_blob)
    blob.download_to_filename(dest_file)
    print(f"✓ Downloaded gs://{bucket_name}/{source_blob} to {dest_file}")


def upload_to_gcs(bucket_name: str, source_file: str, dest_blob: str):
    """Upload a file to GCS."""
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(dest_blob)
    blob.upload_from_filename(source_file)
    print(f"✓ Uploaded {source_file} to gs://{bucket_name}/{dest_blob}")


def process_ham10000(csv_path: str) -> pd.DataFrame:
    """
    Process HAM10000 metadata.

    - Use image_id as identifier
    - One-hot encode dx column
    - Drop vasc class
    """
    print("\n=== Processing HAM10000 ===")
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows")

    # Filter out vasc (not in our 6-class schema)
    df = df[df['dx'] != 'vasc'].copy()
    print(f"After removing 'vasc': {len(df)} rows")

    # One-hot encode dx column
    one_hot = pd.get_dummies(df['dx'], prefix='')
    one_hot.columns = one_hot.columns.str.strip('_')  # Remove prefix underscore

    # Combine with image_id
    result = pd.concat([df[['image_id']], one_hot], axis=1)

    # Ensure all 6 target classes exist (fill missing with 0)
    for cls in TARGET_CLASSES:
        if cls not in result.columns:
            result[cls] = 0

    # Select only target columns in correct order
    result = result[['image_id'] + TARGET_CLASSES]

    print(f"Final HAM10000 shape: {result.shape}")
    print("Class distribution:")
    for cls in TARGET_CLASSES:
        print(f"  {cls}: {result[cls].sum()}")

    return result


def process_isic_2019(csv_path: str) -> pd.DataFrame:
    """
    Process ISIC 2019 ground truth.

    - Use 'image' column as image_id
    - Rename columns to lowercase
    - Drop rows where VASC=1 OR SCC=1 OR UNK=1
    """
    print("\n=== Processing ISIC 2019 ===")
    df = pd.read_csv(csv_path)
    print(f"Loaded {len(df)} rows")

    # Filter out unwanted classes
    df = df[
        (df['VASC'] == 0) &
        (df['SCC'] == 0) &
        (df['UNK'] == 0)
    ].copy()
    print(f"After filtering VASC/SCC/UNK: {len(df)} rows")

    # Rename columns
    column_map = {
        'image': 'image_id',
        'MEL': 'mel',
        'NV': 'nv',
        'BCC': 'bcc',
        'AK': 'akiec',  # Note: ISIC uses AK, we use akiec
        'BKL': 'bkl',
        'DF': 'df'
    }

    df = df.rename(columns=column_map)

    # Select only target columns
    result = df[['image_id'] + TARGET_CLASSES]

    print(f"Final ISIC 2019 shape: {result.shape}")
    print("Class distribution:")
    for cls in TARGET_CLASSES:
        print(f"  {cls}: {result[cls].sum()}")

    return result


def validate_unified_data(df: pd.DataFrame):
    """Run validation checks on unified dataset."""
    print("\n=== Validation ===")

    # Check for nulls
    null_count = df.isnull().sum().sum()
    if null_count > 0:
        print(f"⚠️  WARNING: {null_count} null values found")
    else:
        print("✓ No null values")

    # Check that each row sums to exactly 1
    row_sums = df[TARGET_CLASSES].sum(axis=1)
    invalid_rows = (row_sums != 1).sum()
    if invalid_rows > 0:
        print(f"⚠️  WARNING: {invalid_rows} rows don't sum to 1")
        print(f"   Min sum: {row_sums.min()}, Max sum: {row_sums.max()}")
    else:
        print("✓ All rows sum to exactly 1")

    # Check for duplicate image_ids
    duplicates = df['image_id'].duplicated().sum()
    if duplicates > 0:
        print(f"⚠️  WARNING: {duplicates} duplicate image_ids found")
    else:
        print("✓ No duplicate image_ids")

    # Print overall class distribution
    print("\n=== Overall Class Distribution ===")
    print(f"Total images: {len(df)}")
    for cls in TARGET_CLASSES:
        count = int(df[cls].sum())  # Convert to int for formatting
        pct = (count / len(df)) * 100
        print(f"  {cls:6s}: {count:5d} ({pct:5.2f}%)")

    # Check for class imbalance
    min_class = df[TARGET_CLASSES].sum().min()
    max_class = df[TARGET_CLASSES].sum().max()
    imbalance_ratio = max_class / min_class
    print(f"\nClass imbalance ratio: {imbalance_ratio:.1f}:1")
    if imbalance_ratio > 10:
        print("⚠️  Significant class imbalance detected (will need sample weights in training)")


def main():
    """Main pipeline."""
    print("=" * 60)
    print("Dataset Unification Pipeline")
    print("=" * 60)

    # Create temp directory for downloads
    temp_dir = Path("pipeline/data/temp")
    temp_dir.mkdir(parents=True, exist_ok=True)

    ham10000_local = temp_dir / "ham10000_metadata.csv"
    isic_2019_local = temp_dir / "isic_2019_groundtruth.csv"

    try:
        # Step 1: Download CSVs from GCS
        print("\n[1/5] Downloading datasets from GCS...")
        download_from_gcs(GCS_BUCKET, HAM10000_METADATA, str(ham10000_local))
        download_from_gcs(GCS_BUCKET, ISIC_2019_GROUNDTRUTH, str(isic_2019_local))

        # Step 2: Process HAM10000
        print("\n[2/5] Processing HAM10000...")
        ham_df = process_ham10000(str(ham10000_local))

        # Step 3: Process ISIC 2019
        print("\n[3/5] Processing ISIC 2019...")
        isic_df = process_isic_2019(str(isic_2019_local))

        # Step 4: Concatenate
        print("\n[4/5] Merging datasets...")
        unified_df = pd.concat([ham_df, isic_df], ignore_index=True)
        print(f"Before deduplication: {unified_df.shape}")

        # Remove duplicates (keep first occurrence)
        unified_df = unified_df.drop_duplicates(subset='image_id', keep='first')
        print(f"After deduplication: {unified_df.shape}")

        # Step 5: Validate
        validate_unified_data(unified_df)

        # Save locally
        output_local = Path("pipeline/data/processed/unified_metadata.csv")
        output_local.parent.mkdir(parents=True, exist_ok=True)
        unified_df.to_csv(output_local, index=False)
        print(f"\n✓ Saved to {output_local}")

        # Upload to GCS
        print("\n[5/5] Uploading to GCS...")
        upload_to_gcs(GCS_BUCKET, str(output_local), OUTPUT_PATH)

        print("\n" + "=" * 60)
        print("✓ Pipeline complete!")
        print(f"Output: gs://{GCS_BUCKET}/{OUTPUT_PATH}")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

    finally:
        # Cleanup temp files
        if ham10000_local.exists():
            ham10000_local.unlink()
        if isic_2019_local.exists():
            isic_2019_local.unlink()


if __name__ == "__main__":
    main()
