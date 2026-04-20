"""
Train XGBoost malignancy classifier (Phase 4).

Takes the assembled feature matrix and trains a binary classifier:
    malignant (mel, bcc, akiec) = 1
    benign    (nv,  bkl, df)   = 0

Feature matrix (~13 columns):
    MLP softmax (6)      — p_mel, p_nv, p_bcc, p_akiec, p_bkl, p_df
    Clinical (3)         — age_normalized, sex_encoded, localization_encoded
    Cohort scores (4)    — knn_mean_dist, knn_min_dist, knn_std_dist, lof_score

Key design decisions:
    - Encoders (sex, localization, age median) fitted on TRAIN rows only
      to prevent data leakage into test set
    - scale_pos_weight handles binary imbalance (~2.2:1 benign:malignant)
    - Threshold tuning on K-fold OOF probabilities (unbiased) to hit malignant recall >= 0.95
    - Final model retrained on all train rows with tuned threshold

Inputs (from GCS):
    processed/oof_softmax.npy       (22985, 6)
    processed/oof_image_ids.npy     (22985,)
    processed/unified_metadata.csv
    processed/cohort_scores.csv

Outputs (to GCS):
    processed/xgboost_model.json    — trained XGBoost model
    processed/xgb_threshold.json    — tuned malignancy threshold
    processed/xgb_encoder.json      — categorical encodings + age median

Usage:
    python pipeline/scripts/train_xgboost.py
    python pipeline/scripts/train_xgboost.py --no-upload
"""

import argparse
import io
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import (
    recall_score, precision_score, f1_score,
    roc_auc_score, confusion_matrix
)
from sklearn.model_selection import StratifiedKFold
from google.cloud import storage

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET     = "dermatlas-ml-data"
TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
MALIGNANT_IDX  = {0, 2, 3}   # mel=0, bcc=2, akiec=3

# Recall targets
MEL_RECALL_TARGET     = 0.95
MALIGNANT_RECALL_TARGET = 0.95   # overall malignant recall

# Cohort score columns we use
COHORT_COLS = ["knn_mean_dist", "knn_min_dist", "knn_std_dist", "lof_score"]

# MLP softmax column names
SOFTMAX_COLS = [f"p_{c}" for c in TARGET_CLASSES]


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Train XGBoost malignancy classifier")
    parser.add_argument("--output-dir", default="pipeline/data/processed")
    parser.add_argument("--cv-folds",   type=int, default=5,
        help="K-fold OOF folds used for threshold tuning (default 5)")
    parser.add_argument("--no-upload",  action="store_true")
    return parser.parse_args()


# ── GCS helpers ───────────────────────────────────────────────────────────────
def download_npy(client, blob_path: str) -> np.ndarray:
    print(f"  gs://{GCS_BUCKET}/{blob_path}")
    blob = client.bucket(GCS_BUCKET).blob(blob_path)
    with tempfile.NamedTemporaryFile(suffix=".npy", delete=False) as f:
        blob.download_to_filename(f.name)
        arr = np.load(f.name, allow_pickle=True)
    os.unlink(f.name)
    return arr


def download_csv(client, blob_path: str) -> pd.DataFrame:
    print(f"  gs://{GCS_BUCKET}/{blob_path}")
    content = client.bucket(GCS_BUCKET).blob(blob_path).download_as_bytes()
    return pd.read_csv(io.BytesIO(content))


def upload_file(client, local_path: Path, gcs_path: str):
    client.bucket(GCS_BUCKET).blob(gcs_path).upload_from_filename(str(local_path))
    print(f"  ✓ gs://{GCS_BUCKET}/{gcs_path}")


# ── Feature assembly ──────────────────────────────────────────────────────────
def assemble_features(
    image_ids: np.ndarray,
    softmax:   np.ndarray,
    meta:      pd.DataFrame,
    cohort:    pd.DataFrame,
    encoder:   dict | None = None,
    fit_encoder: bool = False,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """
    Assemble the ~13-column feature matrix for a set of images.

    If fit_encoder=True: fits the encoder on this data (train only).
    If encoder is provided: uses existing encoder (for val/test).

    Returns: (X, y_malignant, encoder)
    """
    ids_list = [str(x) for x in image_ids]
    df = pd.DataFrame({"image_id": ids_list})

    # Attach MLP softmax
    softmax_df = pd.DataFrame(softmax, columns=SOFTMAX_COLS)
    softmax_df["image_id"] = ids_list
    df = df.merge(softmax_df, on="image_id", how="left")

    # Attach metadata (age, sex, localization, malignant)
    meta_cols = ["image_id", "age", "sex", "localization", "malignant"]
    meta_sub  = meta[meta_cols].copy()
    meta_sub["image_id"] = meta_sub["image_id"].astype(str)
    df = df.merge(meta_sub, on="image_id", how="left")

    # Attach cohort scores
    cohort_sub = cohort[["image_id"] + COHORT_COLS].copy()
    cohort_sub["image_id"] = cohort_sub["image_id"].astype(str)
    df = df.merge(cohort_sub, on="image_id", how="left")

    # ── Encode categoricals (fit on train only) ───────────────────────────────
    if fit_encoder:
        age_median  = float(df["age"].median())
        sex_map     = {v: i for i, v in enumerate(
                          sorted(df["sex"].fillna("unknown").unique()))}
        loc_map     = {v: i for i, v in enumerate(
                          sorted(df["localization"].fillna("unknown").unique()))}
        # Issue 3: save train-set cohort medians so eval/CV never uses test median
        cohort_medians = {col: float(df[col].median()) for col in COHORT_COLS}
        encoder = {
            "age_median":     age_median,
            "sex_map":        sex_map,
            "loc_map":        loc_map,
            "cohort_medians": cohort_medians,
        }
    else:
        age_median     = encoder["age_median"]
        sex_map        = encoder["sex_map"]
        loc_map        = encoder["loc_map"]
        cohort_medians = encoder.get("cohort_medians", {})

    df["age_normalized"]       = (df["age"].fillna(age_median) - age_median) / 20.0
    df["sex_encoded"]          = df["sex"].fillna("unknown").map(sex_map).fillna(0).astype(int)
    df["localization_encoded"] = df["localization"].fillna("unknown").map(loc_map).fillna(0).astype(int)

    # Issue 3: use saved train medians for NaN fill, not the current data's median
    for col in COHORT_COLS:
        df[col] = df[col].fillna(cohort_medians.get(col, df[col].median()))

    # ── Final feature matrix ──────────────────────────────────────────────────
    feature_cols = (
        SOFTMAX_COLS +
        ["age_normalized", "sex_encoded", "localization_encoded"] +
        COHORT_COLS
    )
    X = df[feature_cols].values.astype(np.float32)
    y = df["malignant"].fillna(0).astype(int).values

    return X, y, encoder


# ── Threshold tuning ──────────────────────────────────────────────────────────
def tune_threshold(y_true: np.ndarray, y_proba: np.ndarray,
                   target_recall: float = MALIGNANT_RECALL_TARGET) -> float:
    """
    Find the highest threshold that still achieves target malignant recall.
    Higher threshold = more conservative = fewer false positives.
    Lower threshold = more sensitive = fewer false negatives (what we want for cancer).
    """
    best_threshold = 0.5
    best_specificity = 0.0

    for t in np.arange(0.05, 0.95, 0.01):
        preds   = (y_proba >= t).astype(int)
        recall  = recall_score(y_true, preds, zero_division=0)
        if recall >= target_recall:
            # Among all thresholds that hit recall target,
            # pick the one with best specificity (fewest false alarms)
            tn = ((preds == 0) & (y_true == 0)).sum()
            fp = ((preds == 1) & (y_true == 0)).sum()
            specificity = tn / (tn + fp + 1e-6)
            if specificity > best_specificity:
                best_specificity = specificity
                best_threshold   = float(t)

    return best_threshold


# ── Evaluation report ─────────────────────────────────────────────────────────
def print_metrics(y_true, y_proba, threshold, label=""):
    y_pred = (y_proba >= threshold).astype(int)
    recall      = recall_score(y_true, y_pred, zero_division=0)
    precision   = precision_score(y_true, y_pred, zero_division=0)
    f1          = f1_score(y_true, y_pred, zero_division=0)
    auc         = roc_auc_score(y_true, y_proba)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    sensitivity = tp / (tp + fn + 1e-6)
    specificity = tn / (tn + fp + 1e-6)

    print(f"\n  {label}")
    print(f"    Threshold          : {threshold:.2f}")
    print(f"    ROC-AUC            : {auc:.4f}")
    print(f"    F1 Score           : {f1:.4f}")
    print(f"    Malignant recall   : {recall:.4f}  (target ≥ {MALIGNANT_RECALL_TARGET})")
    print(f"    Malignant precision: {precision:.4f}")
    print(f"    Sensitivity        : {sensitivity:.4f}")
    print(f"    Specificity        : {specificity:.4f}")
    print(f"\n    Confusion Matrix:")
    print(f"                     Predicted")
    print(f"                  Benign  Malignant")
    print(f"    Actual Benign    {tn:5d}    {fp:5d}   (TN={tn}, FP={fp})")
    print(f"    Actual Malignant {fn:5d}    {tp:5d}   (FN={fn}, TP={tp})")

    if recall < MALIGNANT_RECALL_TARGET:
        print(f"\n    ⚠️  Recall below target!")
    else:
        print(f"\n    ✓ Recall target met")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args       = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("XGBoost Malignancy Classifier Training")
    print("=" * 60)

    client = storage.Client()

    # ── 1. Load data ──────────────────────────────────────────────────────────
    print("\n[1/6] Loading data from GCS...")
    oof_softmax  = download_npy(client, "processed/oof_softmax.npy").astype(np.float32)
    oof_ids      = download_npy(client, "processed/image_ids.npy" if False
                                else   "processed/oof_image_ids.npy")
    meta         = download_csv(client, "processed/unified_metadata.csv")
    cohort       = download_csv(client, "processed/cohort_scores.csv")

    # Normalize metadata class columns
    for cls in TARGET_CLASSES:
        if cls in meta.columns:
            meta[cls] = (meta[cls].astype(str).str.lower()
                         .map({"true":1,"false":0,"1":1,"0":0,"1.0":1,"0.0":0})
                         .fillna(0).astype(int))

    print(f"  OOF softmax : {oof_softmax.shape}")
    print(f"  OOF ids     : {oof_ids.shape}")
    print(f"  Metadata    : {meta.shape}")
    print(f"  Cohort      : {cohort.shape}")

    # ── 2. Assemble full feature matrix (encoder fitted on all train rows) ───────
    print("\n[2/6] Assembling feature matrix...")

    meta_indexed = meta.set_index("image_id")["malignant"]
    ids_str      = np.array([str(x) for x in oof_ids])

    X_full, y_full_assembled, encoder = assemble_features(
        oof_ids, oof_softmax, meta, cohort, fit_encoder=True
    )

    feature_names = (SOFTMAX_COLS +
                     ["age_normalized", "sex_encoded", "localization_encoded"] +
                     COHORT_COLS)

    print(f"  Feature matrix shape : {X_full.shape}")
    print(f"  Feature columns      : {feature_names}")
    print(f"  Malignant ratio      : {y_full_assembled.mean():.3f}")

    # ── 3. K-fold OOF to collect unbiased probabilities for threshold tuning ───
    print(f"\n[3/6] {args.cv_folds}-fold OOF for threshold tuning...")

    n_benign_full    = (y_full_assembled == 0).sum()
    n_malignant_full = (y_full_assembled == 1).sum()
    spw_full         = n_benign_full / (n_malignant_full + 1e-6)
    print(f"  scale_pos_weight: {spw_full:.3f} "
          f"(benign={n_benign_full}, malignant={n_malignant_full})")

    skf          = StratifiedKFold(n_splits=args.cv_folds, shuffle=True, random_state=42)
    oof_proba    = np.zeros(len(X_full), dtype=np.float32)
    best_iters   = []

    for fold, (tr_idx, val_idx) in enumerate(
            skf.split(X_full, y_full_assembled), start=1):
        X_tr, y_tr = X_full[tr_idx], y_full_assembled[tr_idx]
        X_val, y_val = X_full[val_idx], y_full_assembled[val_idx]

        n_b = (y_tr == 0).sum()
        n_m = (y_tr == 1).sum()
        spw = n_b / (n_m + 1e-6)

        fold_model = xgb.XGBClassifier(
            n_estimators=500,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=spw,
            objective="binary:logistic",
            eval_metric="auc",
            early_stopping_rounds=30,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        fold_model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
        oof_proba[val_idx] = fold_model.predict_proba(X_val)[:, 1]
        best_iters.append(fold_model.best_iteration)
        print(f"  Fold {fold}/{args.cv_folds}: best_iter={fold_model.best_iteration}  "
              f"val_auc={fold_model.best_score:.4f}")

    avg_best_iter = int(np.mean(best_iters))
    print(f"\n  OOF AUC (across all folds): {roc_auc_score(y_full_assembled, oof_proba):.4f}")
    print(f"  Average best iteration    : {avg_best_iter}")

    # ── 4. Tune threshold on OOF probabilities (unbiased estimate) ────────────
    print(f"\n[4/6] Threshold tuning on OOF probs "
          f"(target malignant recall ≥ {MALIGNANT_RECALL_TARGET})...")

    best_threshold = tune_threshold(y_full_assembled, oof_proba)
    print(f"  Tuned threshold: {best_threshold:.2f}")
    print_metrics(y_full_assembled, oof_proba, best_threshold,
                  label="OOF metrics (unbiased — what final model should achieve)")
    print_metrics(y_full_assembled, oof_proba, 0.5,
                  label="OOF metrics (default 0.5 for comparison)")

    # ── 5. Train final model on all train rows ────────────────────────────────
    print(f"\n[5/6] Training final model on all {len(X_full)} train rows "
          f"({avg_best_iter + 1} estimators)...")

    final_model = xgb.XGBClassifier(
        n_estimators=avg_best_iter + 1,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=spw_full,
        objective="binary:logistic",
        random_state=42,
        n_jobs=-1,
        verbosity=0,
    )
    final_model.fit(X_full, y_full_assembled)

    # Feature importance
    importance = dict(zip(feature_names, final_model.feature_importances_))
    print(f"\n  Top 5 features by importance:")
    for feat, imp in sorted(importance.items(), key=lambda x: -x[1])[:5]:
        print(f"    {feat:30s}: {imp:.4f}")

    # Sanity check on full train set (expected to be optimistic)
    train_proba = final_model.predict_proba(X_full)[:, 1]
    print_metrics(y_full_assembled, train_proba, best_threshold,
                  label="Full train set (optimistic — use OOF metrics above for true estimate)")

    # ── 6. (placeholder — numbering kept for compatibility) ──────────────────
    print("\n[6/6] Saving outputs...")

    model_path     = output_dir / "xgboost_model.json"
    threshold_path = output_dir / "xgb_threshold.json"
    encoder_path   = output_dir / "xgb_encoder.json"

    final_model.save_model(str(model_path))

    threshold_data = {
        "malignancy_threshold": best_threshold,
        "target_recall":        MALIGNANT_RECALL_TARGET,
        "feature_names":        feature_names,
    }
    threshold_path.write_text(json.dumps(threshold_data, indent=2))
    encoder_path.write_text(json.dumps(encoder, indent=2))

    print(f"\n  Saved:")
    print(f"    {model_path}")
    print(f"    {threshold_path}  (threshold={best_threshold:.2f})")
    print(f"    {encoder_path}")

    if not args.no_upload:
        print("\n  Uploading to GCS...")
        upload_file(client, model_path,     "processed/xgboost_model.json")
        upload_file(client, threshold_path, "processed/xgb_threshold.json")
        upload_file(client, encoder_path,   "processed/xgb_encoder.json")
        for p in [model_path, threshold_path, encoder_path]:
            p.unlink()
        print("  ✓ Removed local copies (GCS is source of truth)")

    print("\n" + "=" * 60)
    print("✓ XGBoost training complete!")
    print(f"  Malignancy threshold : {best_threshold:.2f}  (tuned on {args.cv_folds}-fold OOF)")
    print(f"  OOF AUC              : {roc_auc_score(y_full_assembled, oof_proba):.4f}")
    print(f"  Final n_estimators   : {avg_best_iter + 1}")
    print(f"  Output               : gs://{GCS_BUCKET}/processed/")
    print("=" * 60)


if __name__ == "__main__":
    main()
