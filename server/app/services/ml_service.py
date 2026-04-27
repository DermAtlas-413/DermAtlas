"""ML inference service — MLP softmax + XGBoost malignancy classification.

Inference pipeline:
  1. MLP(1408-D embedding) → 6-class softmax (mel, nv, bcc, akiec, bkl, df)
  2. XGBoost(softmax + age + sex + localization + knn stats) → P(malignant)
  3. Apply tuned threshold → risk_flag

Models are downloaded from GCS once and cached in memory for the process lifetime.
"""

from __future__ import annotations

import io
import json
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import xgboost as xgb
from google.cloud import storage as gcs_storage

from app.core.config import get_settings

logger = logging.getLogger(__name__)

TARGET_CLASSES = ["mel", "nv", "bcc", "akiec", "bkl", "df"]
MALIGNANT_CLASSES = {"mel", "bcc", "akiec"}


# ── MLP architecture (must match train_mlp_oof.py exactly) ───────────────────

class SkinLesionMLP(nn.Module):
    def __init__(self, input_dim: int, hidden1: int, hidden2: int,
                 n_classes: int, dropout: float):
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

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ── Cached model holders ──────────────────────────────────────────────────────

@dataclass
class _Models:
    mlp: SkinLesionMLP
    xgb_model: xgb.XGBClassifier
    threshold: float
    encoder: dict
    device: torch.device


_cached_models: Optional[_Models] = None
_cache_lock = __import__("threading").Lock()


def _download_bytes(client: gcs_storage.Client, bucket: str, path: str) -> bytes:
    return client.bucket(bucket).blob(path).download_as_bytes()


def _load_models() -> _Models:
    global _cached_models
    if _cached_models is not None:
        return _cached_models

    with _cache_lock:
        if _cached_models is not None:
            return _cached_models

        settings = get_settings()
        bucket = settings.GCS_ML_BUCKET
        client = gcs_storage.Client()

        logger.info("Loading ML models from GCS bucket %s", bucket)

        # Load MLP config
        config_bytes = _download_bytes(client, bucket, settings.MLP_CONFIG_GCS_PATH)
        config = json.loads(config_bytes)

        device = torch.device("cpu")
        mlp = SkinLesionMLP(
            input_dim=config["input_dim"],
            hidden1=config["hidden1"],
            hidden2=config["hidden2"],
            n_classes=config["n_classes"],
            dropout=config["dropout"],
        ).to(device)

        # Load MLP weights
        weights_bytes = _download_bytes(client, bucket, settings.MLP_MODEL_GCS_PATH)
        state_dict = torch.load(io.BytesIO(weights_bytes), map_location=device)
        mlp.load_state_dict(state_dict)
        mlp.eval()

        # Load XGBoost model
        xgb_bytes = _download_bytes(client, bucket, settings.XGB_MODEL_GCS_PATH)
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            f.write(xgb_bytes)
            tmp_path = f.name
        xgb_model = xgb.XGBClassifier()
        xgb_model.load_model(tmp_path)
        os.unlink(tmp_path)

        # Load threshold
        threshold_bytes = _download_bytes(client, bucket, settings.XGB_THRESHOLD_GCS_PATH)
        threshold = float(json.loads(threshold_bytes)["malignancy_threshold"])

        # Load encoder (categorical mappings + cohort medians)
        encoder_bytes = _download_bytes(client, bucket, settings.XGB_ENCODER_GCS_PATH)
        encoder = json.loads(encoder_bytes)

        _cached_models = _Models(
            mlp=mlp,
            xgb_model=xgb_model,
            threshold=threshold,
            encoder=encoder,
            device=device,
        )
        logger.info("ML models loaded successfully (threshold=%.3f)", threshold)
        return _cached_models


# ── Public inference function ─────────────────────────────────────────────────

@dataclass
class MLResult:
    predicted_probs: dict[str, float]   # 6-class softmax from MLP
    malignancy_probability: float       # XGBoost P(malignant)
    risk_flag: bool                     # malignancy_probability >= threshold
    primary_diagnosis: str              # highest-prob class from MLP
    inference_time_ms: int


def run_inference(
    embedding: list[float],
    neighbor_distances: list[float],
    age: Optional[float],
    sex: Optional[str],
    localization: Optional[str],
) -> MLResult:
    """Run MLP + XGBoost inference for a single clinical image.

    Args:
        embedding: 1408-D Vertex AI embedding for the query image.
        neighbor_distances: cosine distances from vector search (up to 10 neighbors).
        age: patient age in years (None if unknown).
        sex: patient sex string e.g. "male"/"female" (None if unknown).
        localization: lesion site e.g. "torso" (None if unknown).
    """
    t0 = time.monotonic()
    models = _load_models()
    enc = models.encoder

    # ── Step 1: MLP → 6-class softmax ────────────────────────────────────────
    x = torch.tensor([embedding], dtype=torch.float32).to(models.device)
    with torch.no_grad():
        logits = models.mlp(x)
        softmax = F.softmax(logits, dim=1).cpu().numpy()[0]  # shape (6,)

    predicted_probs = {cls: float(softmax[i]) for i, cls in enumerate(TARGET_CLASSES)}
    primary_diagnosis = TARGET_CLASSES[int(np.argmax(softmax))]

    # ── Step 2: Assemble XGBoost features ────────────────────────────────────
    age_median = enc["age_median"]
    sex_map = enc["sex_map"]
    loc_map = enc["loc_map"]
    cohort_medians = enc.get("cohort_medians", {})

    age_val = float(age) if age is not None else age_median
    age_normalized = (age_val - age_median) / 20.0

    # Normalize single-char gender ("M"/"F") to full word expected by encoder
    _sex_normalize = {"m": "male", "f": "female"}
    sex_key = _sex_normalize.get((sex or "").lower(), (sex or "unknown").lower())
    sex_encoded = sex_map.get(sex_key, sex_map.get("unknown", 0))

    loc_key = (localization or "unknown").lower()
    loc_encoded = loc_map.get(loc_key, loc_map.get("unknown", 0))

    # KNN distance stats from vector search neighbors
    if neighbor_distances:
        knn_mean_dist = float(np.mean(neighbor_distances))
        knn_min_dist = float(np.min(neighbor_distances))
        knn_std_dist = float(np.std(neighbor_distances)) if len(neighbor_distances) > 1 else 0.0
    else:
        knn_mean_dist = cohort_medians.get("knn_mean_dist", 0.0)
        knn_min_dist = cohort_medians.get("knn_min_dist", 0.0)
        knn_std_dist = cohort_medians.get("knn_std_dist", 0.0)

    # LOF score not computable at inference time — use training median as fallback
    lof_score = cohort_medians.get("lof_score", 1.0)

    features = np.array([[
        *softmax,           # p_mel, p_nv, p_bcc, p_akiec, p_bkl, p_df
        age_normalized,
        sex_encoded,
        loc_encoded,
        knn_mean_dist,
        knn_min_dist,
        knn_std_dist,
        lof_score,
    ]], dtype=np.float32)

    # ── Step 3: XGBoost → P(malignant) ───────────────────────────────────────
    mal_prob = float(models.xgb_model.predict_proba(features)[0][1])
    risk_flag = mal_prob >= models.threshold

    inference_time_ms = int((time.monotonic() - t0) * 1000)

    return MLResult(
        predicted_probs=predicted_probs,
        malignancy_probability=mal_prob,
        risk_flag=risk_flag,
        primary_diagnosis=primary_diagnosis,
        inference_time_ms=inference_time_ms,
    )
