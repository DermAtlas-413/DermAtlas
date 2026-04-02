"""
Compute cohort deviation scores for all images.

The "ugly duckling" concept in dermatology: a lesion that looks visually
different from the BENIGN lesions in the same demographic cohort is suspicious.

Key design decision: KNN indices and LOF are built from TRAIN-SET CONFIRMED
BENIGN cases only. Two filters apply to the reference pool:
  1. Train split only — test images must never contribute to the reference
     distribution they will be scored against (data leakage across split).
  2. Confirmed benign — ISIC 2020 images with no class label are excluded
     because "unknown" does not mean confirmed benign; they pollute the
     ugly duckling reference distribution.

All images (train + test, benign + malignant) are scored against this frozen
reference index. Test images query it without having contributed to it.

Pipeline:
  1. Group benign images by clinical cohort (age_group × sex × localization)
  2. Build a KNN index per cohort group from benign embeddings only
  3. For each image (benign or malignant), query its cohort group
  4. Compute distance from benign baseline as deviation features
  5. Run LocalOutlierFactor on benign embeddings for a global outlier score

Cohort groups (hardcoded from dermatology literature):
  age_group   : young (<40), middle (40-59), old (>=60), unknown
  sex         : male, female, unknown
  localization: head/neck, torso, upper extremity, lower extremity,
                palms/soles, oral/genital, unknown

Fallback strategy for small groups (< MIN_GROUP_SIZE benign samples):
  age_group × sex × localization  →  age_group × sex  →  age_group  →  global benign

Output features per image (cohort_scores.csv):
  image_id
  cohort_key          — benign group used (e.g. "old|male|torso")
  cohort_size         — number of benign images in that group
  knn_mean_dist       — mean cosine distance to K nearest benign neighbors
  knn_min_dist        — distance to closest benign neighbor
  knn_std_dist        — std of distances to K benign neighbors
  lof_score           — Local Outlier Factor vs benign population (higher = more outlier)

Input (all from GCS):
  gs://dermatlas-ml-data/processed/embeddings.npy       (57773, 1408)
  gs://dermatlas-ml-data/processed/image_ids.npy        (57773,)
  gs://dermatlas-ml-data/processed/oof_image_ids.npy    (22985,) — train IDs
  gs://dermatlas-ml-data/processed/unified_metadata.csv

Output:
  gs://dermatlas-ml-data/processed/cohort_scores.csv

Usage:
    python pipeline/scripts/compute_cohort_scores.py
    python pipeline/scripts/compute_cohort_scores.py --no-upload
    python pipeline/scripts/compute_cohort_scores.py --k 30
"""

import argparse
import io
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
from google.cloud import storage
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors, LocalOutlierFactor
from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET  = "dermatlas-ml-data"
GCS_OUTPUT  = "processed/cohort_scores.csv"

TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
BENIGN_CLASSES = {"nv", "bkl", "df"}
MALIGNANT_SET  = {"mel", "bcc", "akiec"}

K              = 20       # neighbors per cohort query
MIN_GROUP_SIZE = K + 5    # minimum benign group size before falling back
LOF_NEIGHBORS  = 20       # neighbors for LocalOutlierFactor
PCA_DIMS       = 128      # reduce to this before LOF (speeds up O(n^2) distance computation)


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Compute cohort deviation scores (benign baseline)")
    parser.add_argument("--k", type=int, default=K,
        help="Number of KNN neighbors per cohort query")
    parser.add_argument("--lof-neighbors", type=int, default=LOF_NEIGHBORS,
        help="Neighbors for LocalOutlierFactor")
    parser.add_argument("--output",
        default="pipeline/data/processed/cohort_scores.csv",
        help="Local output path")
    parser.add_argument("--no-upload", action="store_true",
        help="Skip GCS upload")
    return parser.parse_args()


# ── GCS helpers ───────────────────────────────────────────────────────────────
def download_npy(client, blob_path: str) -> np.ndarray:
    print(f"  Downloading gs://{GCS_BUCKET}/{blob_path} ...")
    blob = client.bucket(GCS_BUCKET).blob(blob_path)
    with tempfile.NamedTemporaryFile(suffix=".npy", delete=False) as f:
        blob.download_to_filename(f.name)
        arr = np.load(f.name, allow_pickle=True)
    os.unlink(f.name)
    print(f"    shape: {arr.shape}")
    return arr


def download_csv(client, blob_path: str) -> pd.DataFrame:
    print(f"  Downloading gs://{GCS_BUCKET}/{blob_path} ...")
    blob = client.bucket(GCS_BUCKET).blob(blob_path)
    content = blob.download_as_bytes()
    df = pd.read_csv(io.BytesIO(content))
    print(f"    rows: {len(df)}")
    return df


def upload_csv(client, local_path: Path):
    print(f"Uploading to gs://{GCS_BUCKET}/{GCS_OUTPUT} ...")
    client.bucket(GCS_BUCKET).blob(GCS_OUTPUT).upload_from_filename(str(local_path))
    print(f"✓ gs://{GCS_BUCKET}/{GCS_OUTPUT}")


# ── Cohort grouping ───────────────────────────────────────────────────────────
def assign_age_group(age) -> str:
    try:
        a = float(age)
        if a < 40:   return "young"
        elif a < 60: return "middle"
        else:        return "old"
    except (ValueError, TypeError):
        return "unknown"


def add_cohort_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["age_group"]    = df["age"].apply(assign_age_group)
    df["sex_clean"]    = df["sex"].fillna("unknown").str.lower().str.strip()
    df["loc_clean"]    = df["localization"].fillna("unknown").str.lower().str.strip()
    df["cohort_key"]   = df["age_group"] + "|" + df["sex_clean"] + "|" + df["loc_clean"]
    return df


# ── KNN index builder (benign only) ──────────────────────────────────────────
def build_group_indices(
    benign_embeddings: np.ndarray,
    benign_meta: pd.DataFrame,
    k: int,
    min_size: int,
) -> dict:
    """
    Build a NearestNeighbors index per cohort group using BENIGN images only.
    Falls back to broader groups when a specific group is too small.

    Returns:
        dict mapping key → (NearestNeighbors, row_positions_in_benign_meta)
    """
    indices = {}

    def add_index(key, positions):
        if len(positions) >= min_size and key not in indices:
            nn = NearestNeighbors(n_neighbors=min(k, len(positions)), metric="cosine")
            nn.fit(benign_embeddings[positions])
            indices[key] = (nn, positions)

    # Level 1: full key
    for key, group in benign_meta.groupby("cohort_key"):
        add_index(key, group.index.tolist())

    # Level 2: age_group × sex
    for (ag, sx), group in benign_meta.groupby(["age_group", "sex_clean"]):
        add_index(f"{ag}|{sx}", group.index.tolist())

    # Level 3: age_group only
    for ag, group in benign_meta.groupby("age_group"):
        add_index(str(ag), group.index.tolist())

    # Level 4: global benign fallback (always present)
    all_pos = list(range(len(benign_meta)))
    nn_global = NearestNeighbors(n_neighbors=min(k, len(all_pos)), metric="cosine")
    nn_global.fit(benign_embeddings)
    indices["global"] = (nn_global, all_pos)

    print(f"  Built {len(indices)} KNN indices (benign only, with fallbacks)")
    return indices


def resolve_group(cohort_key: str, age_group: str, sex: str, indices: dict) -> tuple:
    for key in [cohort_key, f"{age_group}|{sex}", age_group, "global"]:
        if key in indices:
            nn, positions = indices[key]
            return nn, positions, key
    raise RuntimeError(f"No fallback index found for {cohort_key}")


# ── Per-sample KNN features ───────────────────────────────────────────────────
def knn_features(
    embedding: np.ndarray,
    nn: NearestNeighbors,
    positions: list,
    benign_meta: pd.DataFrame,
    self_benign_pos: int | None,
) -> dict:
    """
    Query KNN benign index. Exclude self if present.
    Returns distance-from-benign-baseline features.
    """
    query = embedding.reshape(1, -1)
    distances, neighbor_positions = nn.kneighbors(query)
    distances        = distances[0]
    neighbor_positions = neighbor_positions[0]

    # Map positions back to benign_meta row indices
    neighbor_meta_idx = [positions[p] for p in neighbor_positions]

    # Remove self if present (distance ~ 0)
    if self_benign_pos is not None:
        filtered = [
            (d, idx) for d, idx in zip(distances, neighbor_meta_idx)
            if not (idx == self_benign_pos and d < 1e-6)
        ]
        if filtered:
            distances, neighbor_meta_idx = zip(*filtered)
            distances = list(distances)

    distances = np.array(distances[:nn.n_neighbors], dtype=float)

    return {
        "knn_mean_dist": round(float(distances.mean()), 6),
        "knn_min_dist":  round(float(distances.min()),  6),
        "knn_std_dist":  round(float(distances.std()) if len(distances) > 1 else 0.0, 6),
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args        = parse_args()
    k           = args.k
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Cohort Deviation Score Computation (Benign Baseline)")
    print("=" * 60)

    client = storage.Client()

    # ── 1. Load data ──────────────────────────────────────────────────────────
    print("\n[1/6] Loading data from GCS...")
    embeddings   = download_npy(client, "processed/embeddings.npy").astype(np.float32)
    image_ids    = download_npy(client, "processed/image_ids.npy")
    train_ids    = download_npy(client, "processed/oof_image_ids.npy")
    meta_full    = download_csv(client, "processed/unified_metadata.csv")

    train_ids_set = set(str(x) for x in train_ids)
    print(f"  Train IDs loaded: {len(train_ids_set)} (reference pool restricted to these)")

    # Normalize class columns
    for cls in TARGET_CLASSES:
        if cls in meta_full.columns:
            meta_full[cls] = (
                meta_full[cls].astype(str).str.lower()
                .map({"true": 1, "false": 0, "1": 1, "0": 0, "1.0": 1, "0.0": 0})
                .fillna(0).astype(int)
            )

    # Align embeddings → metadata
    image_ids_list = [str(x) for x in image_ids]
    embed_df  = pd.DataFrame({"image_id": image_ids_list,
                               "embed_idx": range(len(image_ids_list))})
    meta_full = meta_full.merge(embed_df, on="image_id", how="left")
    meta_full = meta_full.dropna(subset=["embed_idx"]).copy()
    meta_full["embed_idx"] = meta_full["embed_idx"].astype(int)
    print(f"  Aligned: {len(meta_full)} images with embeddings")

    # Derive malignant column if missing
    if "malignant" not in meta_full.columns:
        def get_malignant(row):
            for cls in TARGET_CLASSES:
                if row[cls] == 1:
                    return int(cls in MALIGNANT_SET)
            return 0
        meta_full["malignant"] = meta_full.apply(get_malignant, axis=1)

    # Add cohort columns to all images
    meta_full = add_cohort_columns(meta_full)

    # ── 2. Build benign reference subset ─────────────────────────────────────
    print("\n[2/6] Preparing benign reference subset (train-only, confirmed benign)...")

    # Issue 1: restrict to train split only
    is_train = meta_full["image_id"].isin(train_ids_set)

    # Issue 8: exclude ISIC 2020 unknowns (no confirmed class label)
    has_confirmed_label = meta_full[TARGET_CLASSES].sum(axis=1) > 0
    is_confirmed_benign = (meta_full["malignant"] == 0) & has_confirmed_label

    is_reference = is_train & is_confirmed_benign
    benign_meta  = meta_full[is_reference].reset_index(drop=True).copy()

    n_excluded_test    = (~is_train & (meta_full["malignant"] == 0)).sum()
    n_excluded_unknown = (is_train & (meta_full["malignant"] == 0) & ~has_confirmed_label).sum()

    print(f"  Reference pool (train confirmed benign): {len(benign_meta)}")
    print(f"  Excluded — test-set benign             : {n_excluded_test}")
    print(f"  Excluded — ISIC2020 unknowns (train)   : {n_excluded_unknown}")
    print(f"  All images scored against this index   : {len(meta_full)}")

    # Benign class breakdown
    for cls in ["nv", "bkl", "df"]:
        if cls in benign_meta.columns:
            print(f"    {cls}: {int(benign_meta[cls].sum())}")

    # Extract benign embedding matrix
    benign_embed_idx = benign_meta["embed_idx"].values
    benign_embeddings = embeddings[benign_embed_idx]  # (N_benign, 1408)

    # Reverse map: embed_idx → position in benign_meta
    embed_idx_to_benign_pos = {int(ei): pos for pos, ei in enumerate(benign_embed_idx)}

    # ── 3. Build KNN indices ──────────────────────────────────────────────────
    print("\n[3/6] Building benign KNN indices per cohort group...")
    group_indices = build_group_indices(benign_embeddings, benign_meta, k, MIN_GROUP_SIZE)

    # ── 4. Compute LOF on benign embeddings ───────────────────────────────────
    # PCA reduce before LOF: 1408 → 128 dims cuts the O(n^2) distance cost dramatically
    print(f"\n[4/6] PCA reduction ({benign_embeddings.shape[1]}→{PCA_DIMS}) then LOF...")
    pca = PCA(n_components=PCA_DIMS, random_state=42)
    benign_reduced = pca.fit_transform(benign_embeddings)
    print(f"  PCA done. Fitting LOF on ({len(benign_reduced)}, {PCA_DIMS}) ...")

    lof = LocalOutlierFactor(
        n_neighbors=args.lof_neighbors,
        metric="euclidean",   # euclidean on PCA-reduced space is fast + accurate
        novelty=True,
        n_jobs=-1,
    )
    lof.fit(benign_reduced)

    # Score all images: reduce with same PCA, then score
    all_embed_idx        = meta_full["embed_idx"].values
    all_embeddings_align = embeddings[all_embed_idx]
    all_reduced          = pca.transform(all_embeddings_align)
    lof_scores           = -lof.score_samples(all_reduced)  # higher = more outlier
    print(f"  LOF score range: [{lof_scores.min():.4f}, {lof_scores.max():.4f}]")

    # ── 5. Score every image (batched per group) ──────────────────────────────
    # Instead of a per-image Python loop, resolve each image's group then
    # batch-query all images assigned to the same group at once.
    print(f"\n[5/6] Computing KNN deviation scores for {len(meta_full)} images (batched)...")

    # Assign resolved group key to every image
    resolved_keys  = []
    resolved_sizes = []
    for _, row in meta_full.iterrows():
        _, positions, key_used = resolve_group(
            row["cohort_key"], row["age_group"], row["sex_clean"], group_indices
        )
        resolved_keys.append(key_used)
        resolved_sizes.append(len(positions))

    meta_full["resolved_key"]  = resolved_keys
    meta_full["cohort_size"]   = resolved_sizes
    meta_full["row_order"]     = range(len(meta_full))   # preserve original order

    # Batch KNN query per resolved group
    knn_results = {}   # embed_idx → (mean_dist, min_dist, std_dist)

    for key_used, group_df in tqdm(meta_full.groupby("resolved_key"),
                                    desc="KNN groups", unit="group"):
        nn, positions, _ = resolve_group(
            group_df.iloc[0]["cohort_key"],
            group_df.iloc[0]["age_group"],
            group_df.iloc[0]["sex_clean"],
            group_indices,
        )
        batch_idx        = group_df["embed_idx"].values
        batch_embeddings = embeddings[batch_idx]             # (batch, 1408)
        k_query          = nn.n_neighbors + 1                # +1 to allow self-exclusion

        distances, neighbor_positions = nn.kneighbors(batch_embeddings, n_neighbors=k_query)

        for i, embed_idx_val in enumerate(batch_idx):
            dists = distances[i]
            npos  = neighbor_positions[i]
            # Exclude self if present (distance < 1e-6)
            self_benign_pos = embed_idx_to_benign_pos.get(int(embed_idx_val), None)
            if self_benign_pos is not None:
                keep = [
                    (d, p) for d, p in zip(dists, npos)
                    if not (positions[p] == self_benign_pos and d < 1e-6)
                ]
                if keep:
                    dists, _ = zip(*keep)
            dists = np.array(dists[:nn.n_neighbors - 1], dtype=float)
            if len(dists) == 0:
                dists = distances[i][:nn.n_neighbors]
            knn_results[int(embed_idx_val)] = (
                round(float(dists.mean()), 6),
                round(float(dists.min()),  6),
                round(float(dists.std()) if len(dists) > 1 else 0.0, 6),
            )

    # Assemble final rows in original order
    rows = []
    for i, (_, row) in enumerate(meta_full.iterrows()):
        embed_idx_val = int(row["embed_idx"])
        mean_d, min_d, std_d = knn_results.get(embed_idx_val, (0.0, 0.0, 0.0))
        rows.append({
            "image_id":     row["image_id"],
            "cohort_key":   row["resolved_key"],
            "cohort_size":  int(row["cohort_size"]),
            "knn_mean_dist": mean_d,
            "knn_min_dist":  min_d,
            "knn_std_dist":  std_d,
            "lof_score":     round(float(lof_scores[i]), 6),
        })

    # ── 6. Save and upload ────────────────────────────────────────────────────
    print("\n[6/6] Saving results...")
    scores_df = pd.DataFrame(rows)
    scores_df.to_csv(output_path, index=False)
    print(f"✓ Saved {len(scores_df)} rows to {output_path}")

    print(f"\n  Feature summary:")
    for col in ["knn_mean_dist", "knn_min_dist", "knn_std_dist", "lof_score"]:
        print(f"    {col:25s}  mean={scores_df[col].mean():.4f}  "
              f"std={scores_df[col].std():.4f}  "
              f"max={scores_df[col].max():.4f}")

    # Sanity check: malignant cases should have higher mean dist than benign
    if "malignant" in meta_full.columns:
        mal_mask    = meta_full["malignant"].values == 1
        benign_mask = meta_full["malignant"].values == 0
        mal_dist    = scores_df.loc[mal_mask,    "knn_mean_dist"].mean()
        benign_dist = scores_df.loc[benign_mask, "knn_mean_dist"].mean()
        print(f"\n  Sanity check (malignant should > benign):")
        print(f"    Mean knn_mean_dist — malignant: {mal_dist:.4f}  benign: {benign_dist:.4f}  ✓"
              if mal_dist > benign_dist else
              f"    Mean knn_mean_dist — malignant: {mal_dist:.4f}  benign: {benign_dist:.4f}  ⚠️ unexpected")

    if not args.no_upload:
        upload_csv(client, output_path)
        output_path.unlink()
        print("✓ Removed local copy (GCS is source of truth)")

    print("\n" + "=" * 60)
    print("✓ Cohort deviation scores complete!")
    print(f"  Images scored        : {len(scores_df)}")
    print(f"  Reference pool       : {len(benign_meta)} (train confirmed benign)")
    print(f"  Cohort groups        : {scores_df['cohort_key'].nunique()}")
    print(f"  ISIC2020 unknowns    : excluded from reference (Issue 8 fix)")
    print(f"  Test leakage         : eliminated (Issue 1 fix)")
    print(f"  Output               : gs://{GCS_BUCKET}/{GCS_OUTPUT}")
    print("=" * 60)


if __name__ == "__main__":
    main()
