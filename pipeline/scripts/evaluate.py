"""
End-to-end evaluation on the locked test set (Phase 5).

This script evaluates the full pipeline on the 7,662 test rows that were
never touched during training, MLP OOF, XGBoost training, or threshold tuning.

Pipeline for each test image:
    1. Load embedding from embeddings.npy
    2. Run through mlp_final.pt → 6-dim softmax
    3. Assemble feature matrix (softmax + metadata + cohort scores)
       using saved encoder (NOT refitting — would be leakage)
    4. Run through XGBoost → malignancy probability
    5. Apply tuned threshold → binary prediction

Metrics reported:
    Binary malignancy:
        - Confusion matrix (TP, FP, TN, FN)
        - Recall (sensitivity), Precision, Specificity, F1, ROC-AUC
        - Comparison: tuned threshold vs default 0.5

    Per-class MLP performance on test set:
        - Accuracy per class (mel, nv, bcc, akiec, bkl, df)
        - Overall 6-class accuracy

Inputs (all from GCS):
    processed/embeddings.npy
    processed/image_ids.npy
    processed/test_image_ids.npy
    processed/test_labels.npy
    processed/unified_metadata.csv
    processed/cohort_scores.csv
    processed/mlp_final.pt
    processed/mlp_config.json
    processed/xgboost_model.json
    processed/xgb_threshold.json
    processed/xgb_encoder.json

Usage:
    python pipeline/scripts/evaluate.py
    python pipeline/scripts/evaluate.py --no-download-embeddings
"""

import argparse
import io
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
import xgboost as xgb
from sklearn.metrics import (
    recall_score, precision_score, f1_score,
    roc_auc_score, confusion_matrix
)
from google.cloud import storage

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET     = "dermatlas-ml-data"
TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
MALIGNANT_IDX  = {0, 2, 3}   # mel=0, bcc=2, akiec=3
COHORT_COLS    = ["knn_mean_dist", "knn_min_dist", "knn_std_dist", "lof_score"]
SOFTMAX_COLS   = [f"p_{c}" for c in TARGET_CLASSES]
MALIGNANT_RECALL_TARGET = 0.95


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate full pipeline on test set")
    parser.add_argument("--output-dir", default="pipeline/data/processed")
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


def download_file(client, blob_path: str, local_path: Path):
    print(f"  gs://{GCS_BUCKET}/{blob_path}")
    client.bucket(GCS_BUCKET).blob(blob_path).download_to_filename(str(local_path))


# ── MLP definition (must match train_mlp_oof.py exactly) ─────────────────────
class SkinLesionMLP(nn.Module):
    def __init__(self, input_dim=1408, hidden1=512, hidden2=256,
                 n_classes=6, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden1),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden1, hidden2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden2, n_classes),
        )

    def forward(self, x):
        return self.net(x)


# ── MLP inference ─────────────────────────────────────────────────────────────
@torch.no_grad()
def mlp_predict(model, embeddings: np.ndarray, batch_size: int = 512,
                device=None) -> np.ndarray:
    """Run embeddings through MLP and return softmax probabilities (N, 6)."""
    if device is None:
        device = torch.device("cpu")
    model.eval()
    dataset = TensorDataset(torch.FloatTensor(embeddings))
    loader  = DataLoader(dataset, batch_size=batch_size, shuffle=False)
    probs   = [F.softmax(model(xb.to(device)), dim=1).cpu().numpy()
               for (xb,) in loader]
    return np.vstack(probs)


# ── Feature assembly (mirrors train_xgboost.py — no encoder refitting) ───────
def assemble_test_features(
    image_ids:   np.ndarray,
    softmax:     np.ndarray,
    meta:        pd.DataFrame,
    cohort:      pd.DataFrame,
    encoder:     dict,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Build feature matrix for test images using the saved encoder.
    Returns (X_test, y_malignant).
    """
    ids_str = [str(x) for x in image_ids]
    df = pd.DataFrame({"image_id": ids_str})

    # MLP softmax
    softmax_df = pd.DataFrame(softmax, columns=SOFTMAX_COLS)
    softmax_df["image_id"] = ids_str
    df = df.merge(softmax_df, on="image_id", how="left")

    # Metadata
    meta_sub = meta[["image_id", "age", "sex", "localization", "malignant"]].copy()
    meta_sub["image_id"] = meta_sub["image_id"].astype(str)
    df = df.merge(meta_sub, on="image_id", how="left")

    # Cohort scores
    cohort_sub = cohort[["image_id"] + COHORT_COLS].copy()
    cohort_sub["image_id"] = cohort_sub["image_id"].astype(str)
    df = df.merge(cohort_sub, on="image_id", how="left")

    # Apply saved encoder (no refitting)
    age_median = encoder["age_median"]
    sex_map    = encoder["sex_map"]
    loc_map    = encoder["loc_map"]

    df["age_normalized"]       = (df["age"].fillna(age_median) - age_median) / 20.0
    df["sex_encoded"]          = df["sex"].fillna("unknown").map(sex_map).fillna(0).astype(int)
    df["localization_encoded"] = df["localization"].fillna("unknown").map(loc_map).fillna(0).astype(int)

    # Issue 3: use saved train medians, never compute from test data
    cohort_medians = encoder.get("cohort_medians", {})
    for col in COHORT_COLS:
        df[col] = df[col].fillna(cohort_medians.get(col, df[col].median()))

    feature_cols = (SOFTMAX_COLS +
                    ["age_normalized", "sex_encoded", "localization_encoded"] +
                    COHORT_COLS)

    X = df[feature_cols].values.astype(np.float32)
    y = df["malignant"].fillna(0).astype(int).values
    return X, y


# ── Metrics display ───────────────────────────────────────────────────────────
def print_binary_metrics(y_true, y_proba, threshold, label=""):
    y_pred      = (y_proba >= threshold).astype(int)
    recall      = recall_score(y_true, y_pred, zero_division=0)
    precision   = precision_score(y_true, y_pred, zero_division=0)
    f1          = f1_score(y_true, y_pred, zero_division=0)
    auc         = roc_auc_score(y_true, y_proba)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    sensitivity = tp / (tp + fn + 1e-6)
    specificity = tn / (tn + fp + 1e-6)
    ppv         = tp / (tp + fp + 1e-6)   # positive predictive value
    npv         = tn / (tn + fn + 1e-6)   # negative predictive value

    print(f"\n  {label}")
    print(f"    Threshold          : {threshold:.2f}")
    print(f"    ROC-AUC            : {auc:.4f}")
    print(f"    F1 Score           : {f1:.4f}")
    print(f"    Malignant recall   : {recall:.4f}  (target ≥ {MALIGNANT_RECALL_TARGET})")
    print(f"    Malignant precision: {precision:.4f}")
    print(f"    Sensitivity (TPR)  : {sensitivity:.4f}")
    print(f"    Specificity (TNR)  : {specificity:.4f}")
    print(f"    PPV                : {ppv:.4f}  (of flagged cases, how many are malignant)")
    print(f"    NPV                : {npv:.4f}  (of cleared cases, how many are truly benign)")
    print(f"\n    Confusion Matrix:")
    print(f"                        Predicted")
    print(f"                     Benign   Malignant")
    print(f"    Actual Benign    {tn:6d}    {fp:6d}    (TN={tn}, FP={fp})")
    print(f"    Actual Malignant {fn:6d}    {tp:6d}    (FN={fn}, TP={tp})")

    if recall < MALIGNANT_RECALL_TARGET:
        print(f"\n    ⚠️  Recall BELOW target on test set!")
    else:
        print(f"\n    ✓ Recall target met on test set")


def print_mlp_class_metrics(y_true_cls, y_pred_cls):
    """Per-class MLP accuracy on the test set."""
    overall_acc = (y_true_cls == y_pred_cls).mean()
    print(f"\n  MLP per-class accuracy on test set (overall={overall_acc:.4f}):")
    print(f"    {'Class':8s}  {'Acc':6s}  {'Correct':>8s}  {'Total':>8s}")
    print(f"    {'-'*40}")
    for i, cls in enumerate(TARGET_CLASSES):
        mask    = y_true_cls == i
        if mask.sum() == 0:
            continue
        acc     = (y_pred_cls[mask] == i).mean()
        correct = (y_pred_cls[mask] == i).sum()
        total   = mask.sum()
        flag    = "  ⚠️" if acc < 0.70 else ""
        print(f"    {cls:8s}  {acc:.4f}  {correct:8d}  {total:8d}{flag}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args       = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print("=" * 60)
    print("End-to-End Evaluation — Locked Test Set")
    print("=" * 60)

    client = storage.Client()

    # ── 1. Load test IDs and labels ───────────────────────────────────────────
    print("\n[1/6] Loading test set identifiers...")
    test_ids    = download_npy(client, "processed/test_image_ids.npy")
    test_labels = download_npy(client, "processed/test_labels.npy")  # class indices 0-5

    # Convert class indices to binary malignancy
    y_test_binary = np.array([1 if int(c) in MALIGNANT_IDX else 0
                               for c in test_labels])

    print(f"  Test images    : {len(test_ids)}")
    print(f"  Class breakdown:")
    for i, cls in enumerate(TARGET_CLASSES):
        count = (test_labels == i).sum()
        print(f"    {cls:6s}: {count}")
    print(f"  Malignant      : {y_test_binary.sum()} ({y_test_binary.mean()*100:.1f}%)")
    print(f"  Benign         : {(y_test_binary==0).sum()} ({(y_test_binary==0).mean()*100:.1f}%)")

    # ── 2. Load embeddings for test images ────────────────────────────────────
    print("\n[2/6] Loading test embeddings...")
    all_ids    = download_npy(client, "processed/image_ids.npy")
    embeddings = download_npy(client, "processed/embeddings.npy").astype(np.float32)

    # Build lookup: image_id → row index in embeddings.npy
    all_ids_str  = np.array([str(x) for x in all_ids])
    test_ids_str = np.array([str(x) for x in test_ids])
    id_to_idx    = {iid: idx for idx, iid in enumerate(all_ids_str)}

    test_embed_indices = np.array([id_to_idx[iid] for iid in test_ids_str
                                    if iid in id_to_idx])
    found = len(test_embed_indices)
    print(f"  Embeddings found: {found}/{len(test_ids)}")
    if found < len(test_ids):
        print(f"  ⚠️  {len(test_ids)-found} test images missing embeddings")

    test_embeddings = embeddings[test_embed_indices]
    print(f"  Test embedding matrix: {test_embeddings.shape}")

    # ── 3. Load MLP and predict softmax ──────────────────────────────────────
    print("\n[3/6] Running MLP on test embeddings...")
    config_path = output_dir / "mlp_config.json"
    model_path  = output_dir / "mlp_final.pt"
    download_file(client, "processed/mlp_config.json", config_path)
    download_file(client, "processed/mlp_final.pt",    model_path)

    config = json.loads(config_path.read_text())
    mlp = SkinLesionMLP(
        input_dim=config["input_dim"],
        hidden1=config["hidden1"],
        hidden2=config["hidden2"],
        n_classes=config["n_classes"],
        dropout=config["dropout"],
    ).to(device)
    mlp.load_state_dict(torch.load(model_path, map_location=device))

    test_softmax = mlp_predict(mlp, test_embeddings, device=device)
    print(f"  Test softmax shape: {test_softmax.shape}")

    # MLP class predictions
    mlp_preds = test_softmax.argmax(axis=1)
    print_mlp_class_metrics(test_labels[:found], mlp_preds)

    # ── 4. Load XGBoost, encoder, threshold ──────────────────────────────────
    print("\n[4/6] Loading XGBoost model and encoder...")
    xgb_path       = output_dir / "xgboost_model.json"
    threshold_path = output_dir / "xgb_threshold.json"
    encoder_path   = output_dir / "xgb_encoder.json"
    download_file(client, "processed/xgboost_model.json", xgb_path)
    download_file(client, "processed/xgb_threshold.json", threshold_path)
    download_file(client, "processed/xgb_encoder.json",   encoder_path)

    xgb_model  = xgb.XGBClassifier()
    xgb_model.load_model(str(xgb_path))
    threshold  = json.loads(threshold_path.read_text())["malignancy_threshold"]
    encoder    = json.loads(encoder_path.read_text())
    print(f"  Threshold: {threshold:.2f}")

    # ── 5. Assemble test feature matrix ──────────────────────────────────────
    print("\n[5/6] Assembling test feature matrix...")
    meta   = download_csv(client, "processed/unified_metadata.csv")
    cohort = download_csv(client, "processed/cohort_scores.csv")

    for cls in TARGET_CLASSES:
        if cls in meta.columns:
            meta[cls] = (meta[cls].astype(str).str.lower()
                         .map({"true":1,"false":0,"1":1,"0":0,"1.0":1,"0.0":0})
                         .fillna(0).astype(int))

    X_test, y_test_meta = assemble_test_features(
        test_ids_str[:found], test_softmax, meta, cohort, encoder
    )
    print(f"  Test feature matrix: {X_test.shape}")

    # ── 6. XGBoost inference + metrics ───────────────────────────────────────
    print("\n[6/6] Running XGBoost and computing metrics...")
    y_proba = xgb_model.predict_proba(X_test)[:, 1]

    print("\n" + "=" * 60)
    print("TEST SET RESULTS")
    print("=" * 60)

    print_binary_metrics(y_test_binary[:found], y_proba, threshold,
                         label=f"Tuned threshold ({threshold:.2f})")
    print_binary_metrics(y_test_binary[:found], y_proba, 0.5,
                         label="Default threshold (0.50) — for comparison")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    auc = roc_auc_score(y_test_binary[:found], y_proba)
    y_pred_tuned = (y_proba >= threshold).astype(int)
    recall_tuned = recall_score(y_test_binary[:found], y_pred_tuned, zero_division=0)
    f1_tuned     = f1_score(y_test_binary[:found], y_pred_tuned, zero_division=0)
    print(f"  Test ROC-AUC            : {auc:.4f}")
    print(f"  Test F1 (tuned thresh)  : {f1_tuned:.4f}")
    print(f"  Test malignant recall   : {recall_tuned:.4f}  (target ≥ {MALIGNANT_RECALL_TARGET})")
    print(f"  MLP OOF accuracy (train): {config.get('oof_accuracy', 'N/A')}")
    if recall_tuned >= MALIGNANT_RECALL_TARGET:
        print(f"\n  ✓ Pipeline meets clinical recall target on unseen test data")
    else:
        print(f"\n  ⚠️  Pipeline does NOT meet recall target on test data — needs improvement")

    # Cleanup
    for p in [config_path, model_path, xgb_path, threshold_path, encoder_path]:
        if p.exists():
            p.unlink()


if __name__ == "__main__":
    main()
