"""
Generate 1408-D embeddings for all images using Vertex AI multimodalembedding@001.

Reads unified_metadata.csv and generates embeddings for ~24k images in parallel.
Automatically uploads to GCS and removes local copies (GCS is source of truth).

Output (uploaded to gs://dermatlas-ml-data/processed/):
  - embeddings.npy (24647, 1408) - embedding vectors
  - labels.npy (24647, 6) - one-hot encoded labels
  - image_ids.npy (24647,) - image identifiers (preserves row-to-image mapping)

Usage:
    python pipeline/scripts/generate_embeddings.py

    # Use 10 parallel workers to avoid rate limits (default: 20):
    python pipeline/scripts/generate_embeddings.py --workers 10

    # Resume from checkpoint (if interrupted):
    python pipeline/scripts/generate_embeddings.py --resume --workers 10

    # Custom paths:
    python pipeline/scripts/generate_embeddings.py --metadata gs://bucket/path.csv
"""

import os
import sys
import argparse
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import numpy as np
import pandas as pd
from tqdm import tqdm
import vertexai
from vertexai.vision_models import Image, MultiModalEmbeddingModel
from google.cloud import storage

# Configuration
PROJECT_ID = "dermatlas"
REGION = "us-central1"
EMBEDDING_MODEL = "multimodalembedding@001"
EMBEDDING_DIM = 1408

# GCS paths
GCS_BUCKET = "dermatlas-ml-data"
HAM10000_IMAGE_PREFIX_1 = "raw/HAM10000/HAM10000/HAM10000_images_part_1"
HAM10000_IMAGE_PREFIX_2 = "raw/HAM10000/HAM10000/HAM10000_images_part_2"
ISIC_2019_IMAGE_PREFIX = "raw/ISIC/ISIC/ISIC_2019_Training_Input/ISIC_2019_Training_Input"

TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]

# Cache for HAM10000 image locations (populated on first run)
_ham10000_location_cache = {}


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Generate embeddings for skin lesion images")
    parser.add_argument(
        "--metadata",
        default="gs://dermatlas-ml-data/processed/unified_metadata.csv",
        help="Path to unified_metadata.csv (local or GCS)"
    )
    parser.add_argument(
        "--output-dir",
        default="pipeline/data/embeddings",
        help="Local directory to save embeddings"
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from checkpoint (loads existing embeddings)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Save checkpoint every N images"
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=20,
        help="Number of parallel workers for embedding generation"
    )
    return parser.parse_args()


def load_metadata(path: str) -> pd.DataFrame:
    """Load metadata CSV from local or GCS path."""
    if path.startswith("gs://"):
        # Download from GCS
        print(f"Downloading metadata from {path}...")
        bucket_name = path.split("/")[2]
        blob_path = "/".join(path.split("/")[3:])

        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)

        temp_file = "/tmp/unified_metadata.csv"
        blob.download_to_filename(temp_file)
        df = pd.read_csv(temp_file)
        os.remove(temp_file)
    else:
        df = pd.read_csv(path)

    # Convert class columns to int (handles string "True"/"False" from CSV)
    for cls in TARGET_CLASSES:
        if cls in df.columns:
            # Handle string True/False values
            df[cls] = df[cls].astype(str).str.strip().str.lower()
            df[cls] = df[cls].replace({'true': 1, 'false': 0, '1': 1, '0': 0, '1.0': 1, '0.0': 0})
            df[cls] = pd.to_numeric(df[cls], errors='coerce').fillna(0).astype(int)

    print(f"✓ Loaded {len(df)} images")
    return df


def build_ham10000_location_cache():
    """
    Precompute which HAM10000 folder each image is in (part_1 or part_2).
    This avoids trial-and-error lookups during embedding generation.

    Returns:
        dict mapping image_id (without extension) to folder prefix
    """
    print("\n=== Building HAM10000 location cache ===")
    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET)

    cache = {}

    # Scan part_1
    print(f"Scanning {HAM10000_IMAGE_PREFIX_1}...")
    blobs_part1 = bucket.list_blobs(prefix=HAM10000_IMAGE_PREFIX_1 + "/")
    for blob in blobs_part1:
        if blob.name.endswith('.jpg'):
            filename = blob.name.split('/')[-1]
            image_id = filename.replace('.jpg', '')
            cache[image_id] = HAM10000_IMAGE_PREFIX_1
    print(f"  Found {len(cache)} images in part_1")

    part1_count = len(cache)

    # Scan part_2
    print(f"Scanning {HAM10000_IMAGE_PREFIX_2}...")
    blobs_part2 = bucket.list_blobs(prefix=HAM10000_IMAGE_PREFIX_2 + "/")
    for blob in blobs_part2:
        if blob.name.endswith('.jpg'):
            filename = blob.name.split('/')[-1]
            image_id = filename.replace('.jpg', '')
            cache[image_id] = HAM10000_IMAGE_PREFIX_2
    print(f"  Found {len(cache) - part1_count} images in part_2")

    print(f"✓ Total HAM10000 images indexed: {len(cache)}")
    return cache


def construct_gcs_uri(image_id: str, ham_cache: dict, bucket: str = GCS_BUCKET) -> str:
    """
    Construct GCS URI for an image.

    Logic:
    - If image_id starts with "ISIC_", it's from ISIC 2019
    - Otherwise, it's from HAM10000 (look up folder in cache)

    Args:
        image_id: Image identifier (without extension)
        ham_cache: Precomputed mapping of HAM10000 image_id -> folder
        bucket: GCS bucket name

    Returns:
        Full gs:// URI to the image
    """
    if image_id.startswith("ISIC_"):
        return f"gs://{bucket}/{ISIC_2019_IMAGE_PREFIX}/{image_id}.jpg"
    else:
        # Look up which HAM10000 folder contains this image
        if image_id in ham_cache:
            folder_prefix = ham_cache[image_id]
            return f"gs://{bucket}/{folder_prefix}/{image_id}.jpg"
        else:
            # Fallback: try part_1 (will fail if not there)
            print(f"⚠️  {image_id} not found in cache, trying part_1")
            return f"gs://{bucket}/{HAM10000_IMAGE_PREFIX_1}/{image_id}.jpg"


def initialize_vertex_ai():
    """Initialize Vertex AI and load embedding model."""
    print("\n=== Initializing Vertex AI ===")
    vertexai.init(project=PROJECT_ID, location=REGION)

    print(f"Loading {EMBEDDING_MODEL}...")
    model = MultiModalEmbeddingModel.from_pretrained(EMBEDDING_MODEL)
    print(f"✓ Model loaded (dimension: {EMBEDDING_DIM})")

    return model


def generate_embedding(model: MultiModalEmbeddingModel, gcs_uri: str, retry_count: int = 3) -> np.ndarray:
    """
    Generate embedding for a single image with retry logic.

    Returns:
        1408-D numpy array, or None if failed after retries
    """
    for attempt in range(retry_count):
        try:
            image = Image(gcs_uri=gcs_uri)
            result = model.get_embeddings(image=image)
            embedding = np.array(result.image_embedding, dtype=np.float32)

            # Validate dimension
            if embedding.shape[0] != EMBEDDING_DIM:
                raise ValueError(f"Expected {EMBEDDING_DIM}-D, got {embedding.shape[0]}-D")

            return embedding

        except Exception as e:
            if attempt < retry_count - 1:
                wait_time = 2 ** attempt  # Exponential backoff
                print(f"  Retry {attempt + 1}/{retry_count} after {wait_time}s: {e}")
                time.sleep(wait_time)
            else:
                print(f"  ❌ Failed after {retry_count} attempts: {e}")
                return None


def save_checkpoint(embeddings: np.ndarray, labels: np.ndarray, image_ids: list, output_dir: Path):
    """Save intermediate checkpoint."""
    output_dir.mkdir(parents=True, exist_ok=True)

    np.save(output_dir / "embeddings_checkpoint.npy", embeddings)
    np.save(output_dir / "labels_checkpoint.npy", labels)

    with open(output_dir / "image_ids_checkpoint.txt", "w") as f:
        f.write("\n".join(image_ids))


def load_checkpoint(output_dir: Path) -> tuple:
    """Load checkpoint if exists."""
    checkpoint_emb = output_dir / "embeddings_checkpoint.npy"
    checkpoint_labels = output_dir / "labels_checkpoint.npy"
    checkpoint_ids = output_dir / "image_ids_checkpoint.txt"

    if checkpoint_emb.exists() and checkpoint_labels.exists() and checkpoint_ids.exists():
        embeddings = np.load(checkpoint_emb)
        labels = np.load(checkpoint_labels)

        with open(checkpoint_ids, "r") as f:
            processed_ids = set(f.read().strip().split("\n"))

        print(f"✓ Loaded checkpoint: {len(processed_ids)} images already processed")
        return embeddings, labels, processed_ids

    return None, None, set()


def process_single_image(row, model, ham_cache):
    """Process a single image and return results."""
    image_id = row['image_id']
    gcs_uri = construct_gcs_uri(image_id, ham_cache)
    embedding = generate_embedding(model, gcs_uri)

    if embedding is not None:
        label = row[TARGET_CLASSES].values.astype(np.float32)
        return {
            'success': True,
            'image_id': image_id,
            'embedding': embedding,
            'label': label
        }
    else:
        return {
            'success': False,
            'image_id': image_id,
            'gcs_uri': gcs_uri
        }


def main():
    args = parse_args()
    output_dir = Path(args.output_dir)

    print("=" * 60)
    print("Embedding Generation Pipeline")
    print("=" * 60)

    # Load metadata
    print("\n[1/4] Loading metadata...")
    df = load_metadata(args.metadata)

    # Build HAM10000 location cache
    print("\n[2/5] Building HAM10000 image location cache...")
    global _ham10000_location_cache
    _ham10000_location_cache = build_ham10000_location_cache()

    # Initialize Vertex AI
    print("\n[3/5] Initializing Vertex AI...")
    model = initialize_vertex_ai()

    # Load checkpoint if resuming
    embeddings_list = []
    labels_list = []
    image_ids_list = []
    processed_ids = set()

    if args.resume:
        print("\n[4/5] Loading checkpoint...")
        emb_checkpoint, labels_checkpoint, processed_ids = load_checkpoint(output_dir)

        if emb_checkpoint is not None:
            embeddings_list = emb_checkpoint.tolist()
            labels_list = labels_checkpoint.tolist()
            image_ids_list = list(processed_ids)
            print(f"✓ Resuming from {len(processed_ids)} processed images")

    # Filter to unprocessed rows
    unprocessed_df = df[~df['image_id'].isin(processed_ids)].copy()

    # Generate embeddings in parallel
    print(f"\n[4/5] Generating embeddings for {len(unprocessed_df)} images...")
    print(f"Using {args.workers} parallel workers")

    failed_images = []
    checkpoint_counter = 0
    lock = Lock()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        # Submit all tasks
        futures = {
            executor.submit(process_single_image, row, model, _ham10000_location_cache): row['image_id']
            for _, row in unprocessed_df.iterrows()
        }

        # Process results as they complete
        with tqdm(total=len(futures)) as pbar:
            for future in as_completed(futures):
                result = future.result()

                with lock:
                    if result['success']:
                        embeddings_list.append(result['embedding'])
                        labels_list.append(result['label'])
                        image_ids_list.append(result['image_id'])
                        processed_ids.add(result['image_id'])
                        checkpoint_counter += 1

                        # Save checkpoint periodically
                        if checkpoint_counter >= args.batch_size:
                            embeddings_arr = np.array(embeddings_list, dtype=np.float32)
                            labels_arr = np.array(labels_list, dtype=np.float32)
                            save_checkpoint(embeddings_arr, labels_arr, image_ids_list, output_dir)
                            checkpoint_counter = 0
                    else:
                        failed_images.append((result['image_id'], result['gcs_uri']))

                pbar.update(1)

    # Convert to numpy arrays
    print("\n[5/5] Finalizing...")
    embeddings = np.array(embeddings_list, dtype=np.float32)
    labels = np.array(labels_list, dtype=np.float32)

    print(f"✓ Embeddings shape: {embeddings.shape}")
    print(f"✓ Labels shape: {labels.shape}")

    # Validate
    assert embeddings.shape[0] == labels.shape[0], "Mismatch between embeddings and labels"
    assert embeddings.shape[1] == EMBEDDING_DIM, f"Expected {EMBEDDING_DIM}-D embeddings"
    assert labels.shape[1] == len(TARGET_CLASSES), f"Expected {len(TARGET_CLASSES)} classes"

    # Save final outputs
    output_dir.mkdir(parents=True, exist_ok=True)

    embeddings_path = output_dir / "embeddings.npy"
    labels_path = output_dir / "labels.npy"
    image_ids_path = output_dir / "image_ids.npy"

    np.save(embeddings_path, embeddings)
    np.save(labels_path, labels)
    np.save(image_ids_path, np.array(image_ids_list, dtype=object))

    print(f"\n✓ Saved embeddings to {embeddings_path}")
    print(f"✓ Saved labels to {labels_path}")
    print(f"✓ Saved image_ids to {image_ids_path}")

    # Report failures
    if failed_images:
        print(f"\n⚠️  {len(failed_images)} images failed to generate embeddings:")
        failed_log = output_dir / "failed_images.txt"
        with open(failed_log, "w") as f:
            for img_id, uri in failed_images:
                f.write(f"{img_id}\t{uri}\n")
                print(f"  - {img_id}: {uri}")
        print(f"✓ Failed images logged to {failed_log}")

    # Upload to GCS (automatic)
    print(f"\n[6/6] Uploading to GCS bucket: {GCS_BUCKET}...")
    storage_client = storage.Client()
    bucket = storage_client.bucket(GCS_BUCKET)

    for local_file, gcs_path in [
        (embeddings_path, "processed/embeddings.npy"),
        (labels_path, "processed/labels.npy"),
        (image_ids_path, "processed/image_ids.npy")
    ]:
        blob = bucket.blob(gcs_path)
        print(f"  Uploading {local_file.name}...")
        blob.upload_from_filename(str(local_file))
        print(f"  ✓ Uploaded to gs://{GCS_BUCKET}/{gcs_path}")

    # Clean up checkpoints and local files
    print("\n[7/7] Cleaning up...")
    for checkpoint_file in output_dir.glob("*_checkpoint.*"):
        checkpoint_file.unlink()

    # Remove local embedding files (GCS is the source of truth)
    embeddings_path.unlink()
    labels_path.unlink()
    image_ids_path.unlink()
    print("✓ Removed local copies (GCS is source of truth)")

    print("\n" + "=" * 60)
    print("✓ Embedding generation complete!")
    print(f"Success rate: {len(embeddings_list)}/{len(df)} ({100*len(embeddings_list)/len(df):.1f}%)")
    print(f"Embeddings available at: gs://{GCS_BUCKET}/processed/")
    print("=" * 60)


if __name__ == "__main__":
    main()
