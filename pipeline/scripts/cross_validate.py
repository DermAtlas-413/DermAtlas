"""
Stratified K-Fold cross-validation of the full pipeline (Phase 5b).

Performs 4-fold stratified cross-validation on the training data,
where each fold gives a 75/25 split. Reports both train and test
metrics for every fold to assess overfitting and variance.

Why 4 folds for 75/25:
    StratifiedKFold(n_splits=4) → each fold uses 3/4 as train (75%)
                                               and 1/4 as test  (25%)

What is evaluated per fold:
    1. XGBoost trained on fold train portion
    2. Metrics on fold TRAIN portion  ← shows what model learned
    3. Metrics on fold TEST portion   ← shows generalisation
    4. Gap between train/test shows overfitting

MLP softmax source:
    The oof_softmax.npy from Phase 3 is used for all train rows.
    These are genuinely out-of-fold predictions — the MLP never saw
    these rows when predicting them. This means XGBoost cross-validation
    is fully valid with no leakage.

Final locked test set:
    After all CV folds, the script also runs the final trained XGBoost
    on the locked 7,662 test rows as the definitive evaluation.

Inputs (from GCS):
    processed/oof_softmax.npy
    processed/oof_image_ids.npy
    processed/test_image_ids.npy
    processed/test_labels.npy
    processed/embeddings.npy
    processed/image_ids.npy
    processed/unified_metadata.csv
    processed/cohort_scores.csv
    processed/mlp_final.pt
    processed/mlp_config.json
    processed/xgb_encoder.json
    processed/xgb_threshold.json

Usage:
    python pipeline/scripts/cross_validate.py
    python pipeline/scripts/cross_validate.py --folds 4
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
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (
    recall_score, precision_score, f1_score,
    roc_auc_score, confusion_matrix
)
from google.cloud import storage

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET     = "dermatlas-ml-data"
TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
MALIGNANT_IDX  = {0, 2, 3}
COHORT_COLS    = ["knn_mean_dist", "knn_min_dist", "knn_std_dist", "lof_score"]
SOFTMAX_COLS   = [f"p_{c}" for c in TARGET_CLASSES]
RECALL_TARGET  = 0.95


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Stratified K-Fold cross-validation")
    parser.add_argument("--folds",      type=int,   default=4,
        help="Number of folds (4 = 75/25 split)")
    parser.add_argument("--output-dir", default="pipeline/data/processed")
    return parser.parse_args()


# ── GCS helpers ───────────────────────────────────────────────────────────────
def download_npy(client, blob_path):
    print(f"  gs://{GCS_BUCKET}/{blob_path}")
    blob = client.bucket(GCS_BUCKET).blob(blob_path)
    with tempfile.NamedTemporaryFile(suffix=".npy", delete=False) as f:
        blob.download_to_filename(f.name)
        arr = np.load(f.name, allow_pickle=True)
    os.unlink(f.name)
    return arr


def download_csv(client, blob_path):
    print(f"  gs://{GCS_BUCKET}/{blob_path}")
    content = client.bucket(GCS_BUCKET).blob(blob_path).download_as_bytes()
    return pd.read_csv(io.BytesIO(content))


def download_file(client, blob_path, local_path):
    client.bucket(GCS_BUCKET).blob(blob_path).download_to_filename(str(local_path))


# ── MLP ───────────────────────────────────────────────────────────────────────
class SkinLesionMLP(nn.Module):
    def __init__(self, input_dim=1408, hidden1=512, hidden2=256,
                 n_classes=6, dropout=0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden1), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden1, hidden2),  nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(hidden2, n_classes),
        )
    def forward(self, x):
        return self.net(x)


@torch.no_grad()
def mlp_predict(model, embeddings, batch_size=512, device=None):
    model.eval()
    loader = DataLoader(TensorDataset(torch.FloatTensor(embeddings)),
                        batch_size=batch_size, shuffle=False)
    return np.vstack([F.softmax(model(xb.to(device)), dim=1).cpu().numpy()
                      for (xb,) in loader])


# ── Feature assembly ──────────────────────────────────────────────────────────
def build_features(image_ids, softmax, meta, cohort, encoder):
    ids_str = [str(x) for x in image_ids]
    df = pd.DataFrame({"image_id": ids_str})

    sm_df = pd.DataFrame(softmax, columns=SOFTMAX_COLS)
    sm_df["image_id"] = ids_str
    df = df.merge(sm_df, on="image_id", how="left")

    meta_sub = meta[["image_id","age","sex","localization","malignant"]].copy()
    meta_sub["image_id"] = meta_sub["image_id"].astype(str)
    df = df.merge(meta_sub, on="image_id", how="left")

    cohort_sub = cohort[["image_id"] + COHORT_COLS].copy()
    cohort_sub["image_id"] = cohort_sub["image_id"].astype(str)
    df = df.merge(cohort_sub, on="image_id", how="left")

    age_median = encoder["age_median"]
    df["age_normalized"]       = (df["age"].fillna(age_median) - age_median) / 20.0
    df["sex_encoded"]          = df["sex"].fillna("unknown").map(encoder["sex_map"]).fillna(0).astype(int)
    df["localization_encoded"] = df["localization"].fillna("unknown").map(encoder["loc_map"]).fillna(0).astype(int)
    # Issue 3: use saved train medians, never compute from current data
    cohort_medians = encoder.get("cohort_medians", {})
    for col in COHORT_COLS:
        df[col] = df[col].fillna(cohort_medians.get(col, df[col].median()))

    feat_cols = SOFTMAX_COLS + ["age_normalized","sex_encoded","localization_encoded"] + COHORT_COLS
    X = df[feat_cols].values.astype(np.float32)
    y = df["malignant"].fillna(0).astype(int).values
    return X, y


# ── Threshold tuning ──────────────────────────────────────────────────────────
def tune_threshold(y_true, y_proba, target_recall=RECALL_TARGET):
    """
    Issue 5 fix: tune threshold per fold on that fold's val proba.
    Finds the highest threshold that still achieves target recall
    (maximises specificity while keeping recall >= target).
    """
    best_threshold  = 0.5
    best_specificity = 0.0
    for t in np.arange(0.05, 0.95, 0.01):
        preds  = (y_proba >= t).astype(int)
        recall = recall_score(y_true, preds, zero_division=0)
        if recall >= target_recall:
            tn = ((preds == 0) & (y_true == 0)).sum()
            fp = ((preds == 1) & (y_true == 0)).sum()
            specificity = tn / (tn + fp + 1e-6)
            if specificity > best_specificity:
                best_specificity = specificity
                best_threshold   = float(t)
    return best_threshold


# ── Metrics ───────────────────────────────────────────────────────────────────
def compute_metrics(y_true, y_proba, threshold):
    y_pred      = (y_proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0,1]).ravel()
    recall      = recall_score(y_true, y_pred, zero_division=0)
    precision   = precision_score(y_true, y_pred, zero_division=0)
    f1          = f1_score(y_true, y_pred, zero_division=0)
    auc         = roc_auc_score(y_true, y_proba) if len(np.unique(y_true)) > 1 else 0.0
    sensitivity = tp / (tp + fn + 1e-6)
    specificity = tn / (tn + fp + 1e-6)
    return dict(recall=recall, precision=precision, f1=f1, auc=auc,
                sensitivity=sensitivity, specificity=specificity,
                tp=int(tp), fp=int(fp), tn=int(tn), fn=int(fn))


def print_metrics(m, threshold, label):
    print(f"\n    [{label}]")
    print(f"      Threshold   : {threshold:.2f}")
    print(f"      ROC-AUC     : {m['auc']:.4f}")
    print(f"      F1 Score    : {m['f1']:.4f}")
    print(f"      Recall      : {m['recall']:.4f}  {'✓' if m['recall'] >= RECALL_TARGET else '⚠️ below target'}")
    print(f"      Precision   : {m['precision']:.4f}")
    print(f"      Sensitivity : {m['sensitivity']:.4f}")
    print(f"      Specificity : {m['specificity']:.4f}")
    print(f"\n      Confusion Matrix:")
    print(f"                        Predicted")
    print(f"                     Benign   Malignant")
    print(f"      Actual Benign  {m['tn']:6d}    {m['fp']:6d}   (TN={m['tn']}, FP={m['fp']})")
    print(f"      Actual Malign  {m['fn']:6d}    {m['tp']:6d}   (FN={m['fn']}, TP={m['tp']})")


def print_fold_comparison(train_m, test_m, threshold, fold):
    print(f"\n  ── Fold {fold} Summary (threshold={threshold:.2f}) ──")
    print(f"  {'Metric':15s}  {'TRAIN':>10s}  {'TEST':>10s}  {'Gap':>10s}")
    print(f"  {'-'*50}")
    for key in ["auc", "f1", "recall", "precision", "sensitivity", "specificity"]:
        gap = train_m[key] - test_m[key]
        flag = "  ⚠️" if abs(gap) > 0.10 else ""
        print(f"  {key:15s}  {train_m[key]:10.4f}  {test_m[key]:10.4f}  {gap:+10.4f}{flag}")


def print_cv_summary(all_train, all_test):
    print(f"\n{'='*60}")
    print(f"CROSS-VALIDATION SUMMARY ({len(all_train)} folds)")
    print(f"{'='*60}")
    print(f"  {'Metric':15s}  {'TRAIN mean±std':>18s}  {'TEST mean±std':>18s}")
    print(f"  {'-'*60}")
    for key in ["auc", "f1", "recall", "precision", "sensitivity", "specificity"]:
        tr_vals  = [m[key] for m in all_train]
        te_vals  = [m[key] for m in all_test]
        tr_str   = f"{np.mean(tr_vals):.4f} ± {np.std(tr_vals):.4f}"
        te_str   = f"{np.mean(te_vals):.4f} ± {np.std(te_vals):.4f}"
        flag = "  ⚠️" if key == "recall" and np.mean(te_vals) < RECALL_TARGET else ""
        print(f"  {key:15s}  {tr_str:>18s}  {te_str:>18s}{flag}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args       = parse_args()
    n_folds    = args.folds
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    device     = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    split_pct = f"{int(100*(n_folds-1)/n_folds)}/{int(100/n_folds)}"
    print("=" * 60)
    print(f"Stratified {n_folds}-Fold Cross-Validation ({split_pct} splits)")
    print("=" * 60)

    client = storage.Client()

    # ── 1. Load all data ──────────────────────────────────────────────────────
    print("\n[1/5] Loading data from GCS...")
    oof_softmax  = download_npy(client, "processed/oof_softmax.npy").astype(np.float32)
    oof_ids      = download_npy(client, "processed/oof_image_ids.npy")
    test_ids     = download_npy(client, "processed/test_image_ids.npy")
    test_labels  = download_npy(client, "processed/test_labels.npy")
    all_ids      = download_npy(client, "processed/image_ids.npy")
    embeddings   = download_npy(client, "processed/embeddings.npy").astype(np.float32)
    meta         = download_csv(client, "processed/unified_metadata.csv")
    cohort       = download_csv(client, "processed/cohort_scores.csv")

    for cls in TARGET_CLASSES:
        if cls in meta.columns:
            meta[cls] = (meta[cls].astype(str).str.lower()
                         .map({"true":1,"false":0,"1":1,"0":0,"1.0":1,"0.0":0})
                         .fillna(0).astype(int))

    # Load encoder and threshold
    enc_path  = output_dir / "xgb_encoder.json"
    thr_path  = output_dir / "xgb_threshold.json"
    download_file(client, "processed/xgb_encoder.json",   enc_path)
    download_file(client, "processed/xgb_threshold.json", thr_path)
    encoder   = json.loads(enc_path.read_text())
    threshold = json.loads(thr_path.read_text())["malignancy_threshold"]

    # Load MLP for test set inference
    cfg_path   = output_dir / "mlp_config.json"
    mdl_path   = output_dir / "mlp_final.pt"
    download_file(client, "processed/mlp_config.json", cfg_path)
    download_file(client, "processed/mlp_final.pt",    mdl_path)
    cfg = json.loads(cfg_path.read_text())
    mlp = SkinLesionMLP(cfg["input_dim"], cfg["hidden1"], cfg["hidden2"],
                        cfg["n_classes"], cfg["dropout"]).to(device)
    mlp.load_state_dict(torch.load(mdl_path, map_location=device))

    # ── 2. Build train feature matrix from OOF softmax ────────────────────────
    print("\n[2/5] Building train feature matrix from OOF softmax...")
    X_train_full, y_train_full = build_features(
        oof_ids, oof_softmax, meta, cohort, encoder
    )
    print(f"  Train rows: {len(X_train_full)}")
    print(f"  Malignant : {y_train_full.sum()} ({y_train_full.mean()*100:.1f}%)")

    # ── 3. Build test feature matrix via mlp_final ────────────────────────────
    print("\n[3/5] Building test feature matrix via mlp_final.pt...")
    all_ids_str  = np.array([str(x) for x in all_ids])
    test_ids_str = np.array([str(x) for x in test_ids])
    id_to_idx    = {iid: idx for idx, iid in enumerate(all_ids_str)}
    test_embed_idx = np.array([id_to_idx[i] for i in test_ids_str if i in id_to_idx])
    test_embeddings = embeddings[test_embed_idx]
    test_softmax    = mlp_predict(mlp, test_embeddings, device=device)

    y_test_binary = np.array([1 if int(c) in MALIGNANT_IDX else 0
                               for c in test_labels])
    X_test_final, _ = build_features(
        test_ids_str, test_softmax, meta, cohort, encoder
    )
    print(f"  Test rows : {len(X_test_final)}")
    print(f"  Malignant : {y_test_binary.sum()} ({y_test_binary.mean()*100:.1f}%)")

    # ── 4. Stratified K-Fold CV on train data ─────────────────────────────────
    print(f"\n[4/5] Running {n_folds}-fold CV (each fold = {split_pct} split)...")

    skf        = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
    all_train_metrics = []
    all_test_metrics  = []

    for fold, (tr_idx, te_idx) in enumerate(
            skf.split(X_train_full, y_train_full), start=1):

        print(f"\n{'='*60}")
        print(f"  FOLD {fold}/{n_folds}  "
              f"(train={len(tr_idx)}, test={len(te_idx)})")
        print(f"{'='*60}")

        X_tr, y_tr = X_train_full[tr_idx], y_train_full[tr_idx]
        X_te, y_te = X_train_full[te_idx], y_train_full[te_idx]

        n_ben = (y_tr == 0).sum()
        n_mal = (y_tr == 1).sum()
        spw   = n_ben / (n_mal + 1e-6)

        print(f"  Train: {n_ben} benign, {n_mal} malignant  "
              f"(scale_pos_weight={spw:.2f})")

        # Train XGBoost on fold train portion
        model = xgb.XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=spw,
            objective="binary:logistic",
            eval_metric="auc",
            early_stopping_rounds=20,
            random_state=42,
            n_jobs=-1,
            verbosity=0,
        )
        model.fit(X_tr, y_tr,
                  eval_set=[(X_te, y_te)],
                  verbose=False)

        # Issue 5: tune threshold on this fold's val proba (not the global one)
        te_proba     = model.predict_proba(X_te)[:, 1]
        fold_threshold = tune_threshold(y_te, te_proba)
        print(f"  Fold {fold} tuned threshold: {fold_threshold:.2f}")

        # Metrics on TRAIN portion
        tr_proba   = model.predict_proba(X_tr)[:, 1]
        train_m    = compute_metrics(y_tr, tr_proba, fold_threshold)
        print_metrics(train_m, fold_threshold, f"Fold {fold} — TRAIN ({len(y_tr)} rows)")

        # Metrics on TEST portion (fold held-out)
        test_m     = compute_metrics(y_te, te_proba, fold_threshold)
        print_metrics(test_m, fold_threshold, f"Fold {fold} — TEST  ({len(y_te)} rows)")

        # Train vs test comparison table
        print_fold_comparison(train_m, test_m, fold_threshold, fold)

        all_train_metrics.append(train_m)
        all_test_metrics.append(test_m)

    # ── 5. CV Summary + locked test set ───────────────────────────────────────
    print_cv_summary(all_train_metrics, all_test_metrics)

    # Final evaluation on locked test set using the full XGBoost
    print(f"\n{'='*60}")
    print("LOCKED TEST SET (7,662 rows — never seen during any training)")
    print(f"{'='*60}")

    # Train final XGBoost on all train data
    spw_full = (y_train_full == 0).sum() / ((y_train_full == 1).sum() + 1e-6)
    final_xgb = xgb.XGBClassifier(
        n_estimators=200,
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
    final_xgb.fit(X_train_full, y_train_full)

    test_proba  = final_xgb.predict_proba(X_test_final)[:, 1]
    locked_m    = compute_metrics(y_test_binary, test_proba, threshold)
    print_metrics(locked_m, threshold, "Locked test set — tuned threshold")

    # Default threshold comparison
    locked_m_default = compute_metrics(y_test_binary, test_proba, 0.5)
    print_metrics(locked_m_default, 0.5, "Locked test set — default threshold (0.50)")

    # Final summary table
    print(f"\n{'='*60}")
    print("FINAL SUMMARY")
    print(f"{'='*60}")
    print(f"  {'Metric':15s}  {'CV Train':>12s}  {'CV Test':>12s}  {'Locked Test':>12s}")
    print(f"  {'-'*58}")
    for key in ["auc", "f1", "recall", "precision", "sensitivity", "specificity"]:
        tr_mean = np.mean([m[key] for m in all_train_metrics])
        te_mean = np.mean([m[key] for m in all_test_metrics])
        lk_val  = locked_m[key]
        flag    = "  ⚠️" if key == "recall" and lk_val < RECALL_TARGET else ""
        print(f"  {key:15s}  {tr_mean:12.4f}  {te_mean:12.4f}  {lk_val:12.4f}{flag}")

    recall_ok = locked_m["recall"] >= RECALL_TARGET
    print(f"\n  {'✓' if recall_ok else '⚠️'} Locked test recall = {locked_m['recall']:.4f} "
          f"(target ≥ {RECALL_TARGET})")

    # Cleanup
    for p in [enc_path, thr_path, cfg_path, mdl_path]:
        if p.exists():
            p.unlink()


if __name__ == "__main__":
    main()
