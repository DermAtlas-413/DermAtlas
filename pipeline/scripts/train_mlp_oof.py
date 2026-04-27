"""
Train MLP head on Vertex AI embeddings with Out-Of-Fold (OOF) discipline.

Architecture:
    Linear(1408 → 512) → ReLU → Dropout(0.3)
    Linear(512  → 256) → ReLU → Dropout(0.3)
    Linear(256  → 6)   → Softmax

OOF discipline (critical for valid XGBoost training in Phase 4):
    - Split labeled data into 5 stratified folds
    - For each fold: train MLP on 4 folds, predict softmax on held-out fold
    - Concatenate → oof_softmax.npy (N_labeled, 6)  ← fed to XGBoost
    - Train one final MLP on ALL labeled data → used for real inference
    This prevents XGBoost from seeing memorized MLP outputs during training.

Class imbalance:
    Inverse-frequency class weights passed to CrossEntropyLoss.
    nv:df ratio is ~75:1 — without weighting, model ignores df entirely.

Outputs (uploaded to gs://dermatlas-ml-data/processed/):
    oof_softmax.npy     (N_labeled, 6)  — OOF softmax predictions
    oof_image_ids.npy   (N_labeled,)    — image IDs aligned with oof_softmax rows
    mlp_final.pt                        — final model state dict (all labeled data)
    mlp_config.json                     — architecture config for loading model

Usage:
    python pipeline/scripts/train_mlp_oof.py
    python pipeline/scripts/train_mlp_oof.py --epochs 150 --lr 5e-4
    python pipeline/scripts/train_mlp_oof.py --no-upload
"""

import argparse
import io
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import StratifiedKFold, train_test_split
from google.cloud import storage

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET     = "dermatlas-ml-data"
TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
N_CLASSES      = len(TARGET_CLASSES)

INPUT_DIM = 1408
HIDDEN1   = 512
HIDDEN2   = 256
DROPOUT   = 0.3

DEFAULT_EPOCHS   = 100
DEFAULT_LR       = 1e-3
DEFAULT_BATCH    = 256
DEFAULT_PATIENCE = 10
N_FOLDS          = 5


# ── Args ──────────────────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Train MLP with OOF cross-validation")
    parser.add_argument("--epochs",     type=int,   default=DEFAULT_EPOCHS)
    parser.add_argument("--lr",         type=float, default=DEFAULT_LR)
    parser.add_argument("--batch",      type=int,   default=DEFAULT_BATCH)
    parser.add_argument("--patience",   type=int,   default=DEFAULT_PATIENCE)
    parser.add_argument("--folds",      type=int,   default=N_FOLDS)
    parser.add_argument("--output-dir", default="pipeline/data/processed")
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


def upload_file(client, local_path: Path, gcs_path: str):
    client.bucket(GCS_BUCKET).blob(gcs_path).upload_from_filename(str(local_path))
    print(f"  ✓ gs://{GCS_BUCKET}/{gcs_path}")


# ── Model ─────────────────────────────────────────────────────────────────────
class SkinLesionMLP(nn.Module):
    def __init__(self, input_dim=INPUT_DIM, hidden1=HIDDEN1,
                 hidden2=HIDDEN2, n_classes=N_CLASSES, dropout=DROPOUT):
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
        return self.net(x)  # raw logits — softmax applied at inference


# ── Class weights ─────────────────────────────────────────────────────────────
def compute_class_weights(y_cls: np.ndarray, device) -> torch.Tensor:
    counts  = np.bincount(y_cls, minlength=N_CLASSES).astype(float)
    weights = 1.0 / (counts + 1e-6)
    weights = weights / weights.mean()   # normalise so average weight = 1
    print("  Class weights:")
    for cls, w, c in zip(TARGET_CLASSES, weights, counts):
        print(f"    {cls:6s}: count={int(c):5d}  weight={w:.3f}")
    return torch.FloatTensor(weights).to(device)


# ── Training helpers ──────────────────────────────────────────────────────────
def train_one_epoch(model, loader, optimizer, criterion, device) -> float:
    model.train()
    total_loss = 0.0
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)
        optimizer.zero_grad()
        loss = criterion(model(X_batch), y_batch)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * len(X_batch)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def evaluate(model, loader, criterion, device) -> tuple:
    model.eval()
    total_loss, correct = 0.0, 0
    for X_batch, y_batch in loader:
        X_batch, y_batch = X_batch.to(device), y_batch.to(device)
        logits  = model(X_batch)
        total_loss += criterion(logits, y_batch).item() * len(X_batch)
        correct    += (logits.argmax(dim=1) == y_batch).sum().item()
    n = len(loader.dataset)
    return total_loss / n, correct / n


@torch.no_grad()
def predict_softmax(model, X: np.ndarray, batch_size: int, device) -> np.ndarray:
    model.eval()
    dataset = TensorDataset(torch.FloatTensor(X))
    loader  = DataLoader(dataset, batch_size=batch_size, shuffle=False)
    probs   = [F.softmax(model(xb.to(device)), dim=1).cpu().numpy() for (xb,) in loader]
    return np.vstack(probs)


def fit_model(X_train, y_train, X_val, y_val,
              class_weights, args, device, label="") -> tuple:
    """
    Train until early stopping. Returns (best_model, val_softmax_probs).
    val args can be None when training the final model on all data.
    """
    train_loader = DataLoader(
        TensorDataset(torch.FloatTensor(X_train), torch.LongTensor(y_train)),
        batch_size=args.batch, shuffle=True, drop_last=False
    )
    has_val = X_val is not None
    if has_val:
        val_loader = DataLoader(
            TensorDataset(torch.FloatTensor(X_val), torch.LongTensor(y_val)),
            batch_size=args.batch, shuffle=False
        )

    model     = SkinLesionMLP().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=5
    )
    criterion = nn.CrossEntropyLoss(weight=class_weights)

    best_loss, best_state, patience_count = float("inf"), None, 0

    for epoch in range(1, args.epochs + 1):
        train_loss = train_one_epoch(model, train_loader, optimizer, criterion, device)
        monitor    = train_loss

        if has_val:
            val_loss, val_acc = evaluate(model, val_loader, criterion, device)
            monitor = val_loss

        scheduler.step(monitor)

        if monitor < best_loss:
            best_loss      = monitor
            best_state     = {k: v.clone() for k, v in model.state_dict().items()}
            patience_count = 0
        else:
            patience_count += 1

        if epoch % 10 == 0 or epoch == 1:
            if has_val:
                print(f"    {label} | Epoch {epoch:3d} | "
                      f"train={train_loss:.4f}  val={val_loss:.4f}  "
                      f"acc={val_acc:.3f}  patience={patience_count}/{args.patience}")
            else:
                print(f"    {label} | Epoch {epoch:3d} | "
                      f"train={train_loss:.4f}  patience={patience_count}/{args.patience}")

        if patience_count >= args.patience:
            print(f"    Early stop at epoch {epoch}  (best={best_loss:.4f})")
            break

    model.load_state_dict(best_state)
    val_probs = predict_softmax(model, X_val, args.batch, device) if has_val else None
    return model, val_probs


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args       = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    print("=" * 60)
    print("MLP OOF Training Pipeline")
    print("=" * 60)

    client = storage.Client()

    # ── 1. Load ───────────────────────────────────────────────────────────────
    print("\n[1/5] Loading data from GCS...")
    embeddings = download_npy(client, "processed/embeddings.npy").astype(np.float32)
    labels_raw = download_npy(client, "processed/labels.npy").astype(np.float32)
    image_ids  = download_npy(client, "processed/image_ids.npy")
    print(f"  embeddings : {embeddings.shape}")
    print(f"  labels     : {labels_raw.shape}")

    # ── 2. Filter to labeled rows ─────────────────────────────────────────────
    print("\n[2/5] Filtering to labeled rows...")
    labeled_mask = labels_raw.sum(axis=1) > 0
    X            = embeddings[labeled_mask]
    y_onehot     = labels_raw[labeled_mask]
    ids_labeled  = image_ids[labeled_mask]
    y_cls        = y_onehot.argmax(axis=1).astype(int)

    print(f"  Labeled rows: {len(X)}")
    for i, cls in enumerate(TARGET_CLASSES):
        print(f"    {cls:6s}: {int((y_cls == i).sum())}")

    # ── 3. Train/test split (80/20, stratified, done once) ───────────────────
    print("\n[3/6] Train/test split (75/25 stratified)...")
    train_idx_all, test_idx_all = train_test_split(
        np.arange(len(X)), test_size=0.25, stratify=y_cls, random_state=42
    )

    X_train, X_test         = X[train_idx_all],         X[test_idx_all]
    y_train, y_test         = y_cls[train_idx_all],      y_cls[test_idx_all]
    ids_train, ids_test     = ids_labeled[train_idx_all], ids_labeled[test_idx_all]

    print(f"  Train: {len(X_train)} rows")
    print(f"  Test : {len(X_test)} rows  ← locked away until evaluate.py")
    print(f"  Train class distribution:")
    for i, cls in enumerate(TARGET_CLASSES):
        print(f"    {cls:6s}: {int((y_train == i).sum())}")

    # ── 4. Class weights (computed from train rows only) ──────────────────────
    print("\n[4/6] Computing class weights (train set only)...")
    class_weights = compute_class_weights(y_train, device)

    # ── 5. OOF cross-validation on train rows ─────────────────────────────────
    print(f"\n[5/6] {args.folds}-fold OOF training on train set...")
    skf         = StratifiedKFold(n_splits=args.folds, shuffle=True, random_state=42)
    oof_softmax = np.zeros((len(X_train), N_CLASSES), dtype=np.float32)

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X_train, y_train), start=1):
        print(f"\n  ── Fold {fold}/{args.folds} "
              f"(train={len(tr_idx)}, val={len(val_idx)}) ──")
        _, val_probs = fit_model(
            X_train[tr_idx], y_train[tr_idx],
            X_train[val_idx], y_train[val_idx],
            class_weights, args, device, label=f"Fold {fold}"
        )
        oof_softmax[val_idx] = val_probs

    # OOF sanity check
    oof_preds = oof_softmax.argmax(axis=1)
    oof_acc   = (oof_preds == y_train).mean()
    print(f"\n  OOF overall accuracy : {oof_acc:.4f}")
    print(f"  OOF per-class accuracy:")
    for i, cls in enumerate(TARGET_CLASSES):
        mask = y_train == i
        if mask.sum() > 0:
            acc = (oof_preds[mask] == i).mean()
            print(f"    {cls:6s}: {acc:.3f}  (n={mask.sum()})")

    # ── 6. Final model on all TRAIN rows (not test) ───────────────────────────
    print(f"\n[6/6] Training final model on all {len(X_train)} train rows...")
    final_model, _ = fit_model(
        X_train, y_train, None, None,
        class_weights, args, device, label="Final"
    )

    # ── Save ──────────────────────────────────────────────────────────────────
    oof_softmax_path  = output_dir / "oof_softmax.npy"
    oof_ids_path      = output_dir / "oof_image_ids.npy"
    test_ids_path     = output_dir / "test_image_ids.npy"
    test_labels_path  = output_dir / "test_labels.npy"
    model_path        = output_dir / "mlp_final.pt"
    config_path       = output_dir / "mlp_config.json"

    np.save(oof_softmax_path, oof_softmax)
    np.save(oof_ids_path,     ids_train)
    np.save(test_ids_path,    ids_test)
    np.save(test_labels_path, y_test)
    torch.save(final_model.state_dict(), model_path)
    config_path.write_text(json.dumps({
        "input_dim":      INPUT_DIM,
        "hidden1":        HIDDEN1,
        "hidden2":        HIDDEN2,
        "n_classes":      N_CLASSES,
        "dropout":        DROPOUT,
        "target_classes": TARGET_CLASSES,
        "oof_accuracy":   float(oof_acc),
        "n_train":        len(X_train),
        "n_test":         len(X_test),
    }, indent=2))

    print(f"\n  oof_softmax   : {oof_softmax.shape}  (train rows, OOF predictions)")
    print(f"  oof_image_ids : {ids_train.shape}")
    print(f"  test_image_ids: {ids_test.shape}  (locked for evaluate.py)")
    print(f"  test_labels   : {y_test.shape}")

    if not args.no_upload:
        print("\n  Uploading to GCS...")
        upload_file(client, oof_softmax_path, "processed/oof_softmax.npy")
        upload_file(client, oof_ids_path,     "processed/oof_image_ids.npy")
        upload_file(client, test_ids_path,    "processed/test_image_ids.npy")
        upload_file(client, test_labels_path, "processed/test_labels.npy")
        upload_file(client, model_path,        "processed/mlp_final.pt")
        upload_file(client, config_path,       "processed/mlp_config.json")
        for p in [oof_softmax_path, oof_ids_path, test_ids_path,
                  test_labels_path, model_path, config_path]:
            p.unlink()
        print("  ✓ Removed local copies (GCS is source of truth)")

    print("\n" + "=" * 60)
    print("✓ MLP OOF training complete!")
    print(f"  OOF accuracy : {oof_acc:.4f}")
    print(f"  Train rows   : {len(X_train)}")
    print(f"  Test rows    : {len(X_test)}  (saved, not used here)")
    print(f"  Output       : gs://{GCS_BUCKET}/processed/")
    print("=" * 60)


if __name__ == "__main__":
    main()
