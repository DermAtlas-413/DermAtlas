"""
Unify HAM10000, ISIC 2019, and ISIC 2020 into a single metadata CSV.

Deduplication strategy (priority order):
  1. HAM10000   — highest quality (dx_type: histo/follow_up/etc.)
  2. ISIC 2019  — all HAM10000 images also appear here; we keep HAM's version
  3. ISIC 2020  — no overlap with either above dataset

Key facts discovered from data analysis:
  - HAM10000 images ALL appear in ISIC 2019 (HAM = ISIC 2018 challenge)
  - ISIC 2019 has 15,316 images not in HAM10000
  - ISIC 2019 ∩ ISIC 2020 = 0 overlaps
  - HAM10000 ∩ ISIC 2020 = 0 overlaps

Diagnosis mapping
─────────────────
HAM10000 (dx column, already in our schema):
  mel, nv, bcc, akiec, bkl, df  → kept as-is
  vasc                           → dropped

ISIC 2019 (one-hot columns MEL/NV/BCC/AK/BKL/DF/VASC/SCC/UNK):
  MEL → mel, NV → nv, BCC → bcc, AK → akiec, BKL → bkl, DF → df
  VASC, SCC, UNK                → dropped

ISIC 2020 (diagnosis text column):
  melanoma                            → mel
  nevus                               → nv
  seborrheic keratosis                → bkl
  lentigo NOS                         → bkl
  lichenoid keratosis                 → bkl
  solar lentigo                       → bkl
  unknown / cafe-au-lait / atypical   → dropped

Localization unified to 7 categories:
  head/neck, torso, upper extremity, lower extremity,
  palms/soles, oral/genital, unknown

Inputs:
  HAM10000  : 1 CSV  (labels + metadata together)
  ISIC 2019 : 2 CSVs (labels CSV + metadata CSV, joined on 'image')
  ISIC 2020 : 1 CSV  (labels + metadata together)

Output unified schema:
  image_id, source_dataset,
  mel, nv, bcc, akiec, bkl, df,
  age, sex, localization, dx_type

Usage:
    python pipeline/scripts/unify_datasets.py
    python pipeline/scripts/unify_datasets.py --no-upload
"""

import argparse
from pathlib import Path

import pandas as pd
from google.cloud import storage

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET = "dermatlas-ml-data"
GCS_OUTPUT = "processed/unified_metadata.csv"

TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]

# Clinical malignancy mapping
# mel   → malignant (melanoma)
# bcc   → malignant (basal cell carcinoma)
# akiec → malignant (intraepithelial carcinoma — pre-malignant but treated as high-risk)
# nv, bkl, df → benign
MALIGNANT_MAP = {
    "mel":   1,
    "nv":    0,
    "bcc":   1,
    "akiec": 1,
    "bkl":   0,
    "df":    0,
}

ISIC2020_LABEL_MAP = {
    "melanoma":                           "mel",
    "nevus":                              "nv",
    "seborrheic keratosis":               "bkl",
    "lentigo nos":                        "bkl",
    "lichenoid keratosis":                "bkl",
    "solar lentigo":                      "bkl",
    "unknown":                            None,
    "cafe-au-lait macule":                None,
    "atypical melanocytic proliferation": None,
}

# HAM10000 granular site → unified 7-category site
HAM_SITE_MAP = {
    "scalp":           "head/neck",
    "ear":             "head/neck",
    "face":            "head/neck",
    "neck":            "head/neck",
    "back":            "torso",
    "trunk":           "torso",
    "chest":           "torso",
    "abdomen":         "torso",
    "upper extremity": "upper extremity",
    "lower extremity": "lower extremity",
    "foot":            "lower extremity",
    "acral":           "lower extremity",
    "hand":            "palms/soles",
    "genital":         "oral/genital",
    "unknown":         "unknown",
}

# ISIC 2019 granular torso variants → unified
ISIC19_SITE_MAP = {
    "anterior torso":  "torso",
    "posterior torso": "torso",
    "lateral torso":   "torso",
    "head/neck":       "head/neck",
    "upper extremity": "upper extremity",
    "lower extremity": "lower extremity",
    "palms/soles":     "palms/soles",
    "oral/genital":    "oral/genital",
}


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(
        description="Unify HAM10000 + ISIC 2019 + ISIC 2020 metadata"
    )
    parser.add_argument("--ham",
        default="pipeline/data/raw_HAM10000_HAM10000_HAM10000_metadata.csv")
    parser.add_argument("--isic19-labels",
        default="pipeline/data/raw_ISIC_ISIC_ISIC_2019_Training_GroundTruth.csv")
    parser.add_argument("--isic19-meta",
        default="pipeline/data/raw_ISIC_ISIC_ISIC_2019_Training_Metadata.csv")
    parser.add_argument("--isic20",
        default="pipeline/data/ISIC_2020_Training_GroundTruth_v2.csv")
    parser.add_argument("--output",
        default="pipeline/data/processed/unified_metadata.csv")
    parser.add_argument("--no-upload", action="store_true",
        help="Skip GCS upload")
    return parser.parse_args()


# ── Helpers ───────────────────────────────────────────────────────────────────
def normalize_sex(series: pd.Series) -> pd.Series:
    s = series.str.strip().str.lower()
    s[~s.isin(["male", "female"])] = "unknown"
    return s.fillna("unknown")


def print_class_dist(df: pd.DataFrame, label: str):
    print(f"  Class distribution ({label}, n={len(df)}):")
    for cls in TARGET_CLASSES:
        count = int(df[cls].sum())
        pct   = 100 * count / len(df) if len(df) else 0
        print(f"    {cls:6s}: {count:5d}  ({pct:.2f}%)")


# ── Dataset processors ────────────────────────────────────────────────────────
def process_ham10000(path: str) -> pd.DataFrame:
    print("\n=== HAM10000 ===")
    df = pd.read_csv(path)
    print(f"  Loaded {len(df)} rows")

    before = len(df)
    df = df[df["dx"] != "vasc"].copy()
    print(f"  Dropped {before - len(df)} vasc rows → {len(df)} remaining")

    # One-hot
    for cls in TARGET_CLASSES:
        df[cls] = (df["dx"] == cls).astype(int)

    # Localization
    df["localization"] = (
        df["localization"].str.strip().str.lower()
        .map(HAM_SITE_MAP).fillna("unknown")
    )

    df["sex"]          = normalize_sex(df["sex"])
    df["age"]          = pd.to_numeric(df["age"], errors="coerce")
    df["dx_type"]      = df["dx_type"].str.strip().str.lower().fillna("unknown")
    df["source_dataset"] = "ham10000"
    df = df.rename(columns={"image_id": "image_id"})

    result = df[["image_id", "source_dataset"] + TARGET_CLASSES +
                ["age", "sex", "localization", "dx_type"]].copy()
    print_class_dist(result, "HAM10000")
    return result


def process_isic2019(labels_path: str, meta_path: str,
                     exclude_ids: set) -> pd.DataFrame:
    print("\n=== ISIC 2019 ===")
    labels = pd.read_csv(labels_path)
    meta   = pd.read_csv(meta_path)
    print(f"  Labels: {len(labels)} rows  |  Metadata: {len(meta)} rows")

    # Join on 'image'
    df = labels.merge(meta, on="image", how="left")
    print(f"  After join: {len(df)} rows")

    # Remove images already covered by HAM10000
    before = len(df)
    df = df[~df["image"].isin(exclude_ids)].copy()
    print(f"  Removed {before - len(df)} HAM10000 duplicates → {len(df)} remaining")

    # Drop unwanted classes (row has 1 in VASC, SCC, or UNK)
    before = len(df)
    df = df[
        (df["VASC"] == 0) &
        (df["SCC"]  == 0) &
        (df["UNK"]  == 0)
    ].copy()
    print(f"  Dropped {before - len(df)} VASC/SCC/UNK rows → {len(df)} remaining")

    # Rename class columns to our schema
    df = df.rename(columns={
        "image": "image_id",
        "MEL":   "mel",
        "NV":    "nv",
        "BCC":   "bcc",
        "AK":    "akiec",
        "BKL":   "bkl",
        "DF":    "df",
    })

    # Convert one-hot to int
    for cls in TARGET_CLASSES:
        df[cls] = df[cls].fillna(0).astype(int)

    # Localization
    df["localization"] = (
        df["anatom_site_general"].str.strip().str.lower()
        .map(ISIC19_SITE_MAP).fillna("unknown")
    )

    df["sex"]            = normalize_sex(df["sex"])
    df["age"]            = pd.to_numeric(df["age_approx"], errors="coerce")
    df["dx_type"]        = "unknown"   # ISIC 2019 has no dx_type
    df["source_dataset"] = "isic2019"

    result = df[["image_id", "source_dataset"] + TARGET_CLASSES +
                ["age", "sex", "localization", "dx_type"]].copy()
    print_class_dist(result, "ISIC 2019 unique")
    return result


def process_isic2020(path: str) -> pd.DataFrame:
    print("\n=== ISIC 2020 ===")
    df = pd.read_csv(path)
    print(f"  Loaded {len(df)} rows")

    df = df.rename(columns={"image_name": "image_id"})

    # Map diagnosis (None = unknown/unmappable → keep as all-zero row)
    df["class_name"] = (
        df["diagnosis"].str.strip().str.lower()
        .map(ISIC2020_LABEL_MAP)
    )

    # Count how many are unknown vs mappable
    n_unknown   = df["class_name"].isna().sum()
    n_mappable  = df["class_name"].notna().sum()
    print(f"  Mappable (labeled):  {n_mappable}")
    print(f"  Unknown (all-zero):  {n_unknown}")

    # One-hot: unknown rows get all 0s (no class assigned)
    for cls in TARGET_CLASSES:
        df[cls] = (df["class_name"] == cls).astype(int)

    # Localization (already in unified format)
    df["localization"] = (
        df["anatom_site_general_challenge"].str.strip().str.lower()
        .fillna("unknown")
    )

    df["sex"]            = normalize_sex(df["sex"])
    df["age"]            = pd.to_numeric(df["age_approx"], errors="coerce")
    df["dx_type"]        = "unknown"
    df["source_dataset"] = "isic2020"

    result = df[["image_id", "source_dataset"] + TARGET_CLASSES +
                ["age", "sex", "localization", "dx_type"]].copy()
    print_class_dist(result, "ISIC 2020 usable")
    return result


# ── Validation ────────────────────────────────────────────────────────────────
def validate(df: pd.DataFrame):
    print("\n=== Validation ===")

    nulls = df.isnull().sum()
    if nulls.sum() > 0:
        print("  ⚠️  Null values:")
        print(nulls[nulls > 0].to_string())
    else:
        print("  ✓ No null values")

    row_sums = df[TARGET_CLASSES].sum(axis=1)
    bad = ((row_sums != 1) & (row_sums != 0)).sum()
    n_zero = (row_sums == 0).sum()
    if bad > 0:
        print(f"  ⚠️  {bad} rows don't sum to 0 or 1")
    else:
        print(f"  ✓ All rows valid  ({n_zero} unknown all-zero rows, {len(df)-n_zero} labeled rows)")

    dups = df["image_id"].duplicated().sum()
    if dups > 0:
        print(f"  ⚠️  {dups} duplicate image_ids")
    else:
        print("  ✓ No duplicate image_ids")

    print(f"\n=== Final Class Distribution (n={len(df)}) ===")
    for cls in TARGET_CLASSES:
        count = int(df[cls].sum())
        pct   = 100 * count / len(df)
        print(f"  {cls:6s}: {count:5d}  ({pct:5.2f}%)")

    print(f"\n=== Source Breakdown ===")
    print(df["source_dataset"].value_counts().to_string())

    print(f"\n=== Localization Breakdown ===")
    print(df["localization"].value_counts().to_string())

    print(f"\n=== Sex Breakdown ===")
    print(df["sex"].value_counts().to_string())

    print(f"\n=== dx_type Breakdown ===")
    print(df["dx_type"].value_counts().to_string())

    ratio = df[TARGET_CLASSES].sum().max() / df[TARGET_CLASSES].sum().min()
    print(f"\n  Class imbalance ratio: {ratio:.1f}:1  (nv vs df)")


# ── GCS upload ────────────────────────────────────────────────────────────────
def upload_to_gcs(local_path: str):
    print(f"\nUploading to gs://{GCS_BUCKET}/{GCS_OUTPUT} ...")
    client = storage.Client()
    blob   = client.bucket(GCS_BUCKET).blob(GCS_OUTPUT)
    blob.upload_from_filename(local_path)
    print(f"  ✓ gs://{GCS_BUCKET}/{GCS_OUTPUT}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    print("=" * 60)
    print("Dataset Unification: HAM10000 + ISIC 2019 + ISIC 2020")
    print("=" * 60)

    # Step 1 — HAM10000 (highest priority)
    ham_df  = process_ham10000(args.ham)
    ham_ids = set(ham_df["image_id"])

    # Step 2 — ISIC 2019 unique (exclude HAM10000 images)
    i19_df  = process_isic2019(args.isic19_labels, args.isic19_meta, ham_ids)

    # Step 3 — ISIC 2020 (no overlap with either)
    i20_df  = process_isic2020(args.isic20)

    # Step 4 — Concatenate in priority order
    print("\n=== Merging ===")
    unified = pd.concat([ham_df, i19_df, i20_df], ignore_index=True)
    print(f"  Combined: {len(unified)} rows")

    # Derive malignant column from one-hot classes
    # Rows with all-zero labels (unknown ISIC 2020) → malignant=0 (confirmed benign)
    def get_malignant(row):
        if row[TARGET_CLASSES].sum() == 0:
            return 0  # unknown but confirmed benign
        return MALIGNANT_MAP[TARGET_CLASSES[row[TARGET_CLASSES].values.argmax()]]
    unified["malignant"] = unified.apply(get_malignant, axis=1)

    # Safety dedup (should already be clean)
    before  = len(unified)
    unified = unified.drop_duplicates(subset="image_id", keep="first")
    removed = before - len(unified)
    if removed:
        print(f"  ⚠️  Safety dedup removed {removed} extra duplicates")
    else:
        print("  ✓ No duplicates found (as expected)")

    # Step 5 — Validate
    validate(unified)

    # Step 6 — Save
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    unified.to_csv(output_path, index=False)
    print(f"\n  ✓ Saved to {output_path}")

    # Step 7 — Upload
    if not args.no_upload:
        upload_to_gcs(str(output_path))

    print("\n" + "=" * 60)
    print("✓ Unification complete!")
    print(f"  Total images : {len(unified)}")
    print(f"  HAM10000     : {len(ham_df)}")
    print(f"  ISIC 2019    : {len(i19_df)}")
    print(f"  ISIC 2020    : {len(i20_df)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
