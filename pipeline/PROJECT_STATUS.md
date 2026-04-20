# DermAtlas ML Pipeline - Project Status

**Last Updated:** March 2, 2026
**Current Phase:** Ready to start Phase 3 (XGBoost Training)

---

## Project Overview

DermAtlas is a clinical decision support system for dermatology that combines:
- **Classification**: XGBoost classifier on 1408-D embeddings for 6-class skin lesion diagnosis
- **Retrieval**: Content-based image retrieval (CBIR) to show top-k similar historical cases
- **Explainability**: Full probability distributions and similar case retrieval

**Tech Stack:**
- Vertex AI `multimodalembedding@001` (1408-D embeddings)
- Cloud SQL with pgvector for vector storage
- XGBoost with per-class threshold tuning
- Vertex Vector Search for top-k retrieval
- FastAPI backend + React Native frontend

**Dataset:**
- HAM10000: 10,015 images (7 classes, filtered to 6)
- ISIC 2019: 14,632 images (filtered from 25k)
- **Total unified:** 24,647 unique images across 6 classes
- **Classes:** mel, nv, bcc, akiec, bkl, df (severe imbalance: nv=67%, df=1%)

---

## ✅ Phase 1: Database Schema (COMPLETED)

**Goal:** Add pgvector support and prediction tracking to database

**What was done:**
1. ✅ Updated `requirements.txt` with ML dependencies (pgvector, xgboost, scikit-learn, numpy)
2. ✅ Updated `docker-compose.yml` to use `pgvector/pgvector:pg15` image
3. ✅ Created Alembic migration `b7c3d8e21fa9_add_embeddings_and_predictions.py`:
   - Added `embedding_vector` column (1408-D) to `reference_atlas` table
   - Added `embedding_vector` column (1408-D) to `clinical_images` table
   - Created `clinical_image_predictions` table for storing XGBoost inference results
4. ✅ Ran `alembic upgrade head` and verified migration applied successfully
5. ✅ Committed changes to feature branch `feature/ml-pipeline-setup`

**Key Files:**
- `server/alembic/versions/b7c3d8e21fa9_add_embeddings_and_predictions.py`
- `server/app/models/clinical_image_prediction.py` (new)
- `server/docker-compose.yml` (modified)

---

## ✅ Phase 2: Embedding Generation (PARTIALLY COMPLETED)

**Goal:** Generate 1408-D embeddings for all 24,647 images using Vertex AI

### 2.1 Dataset Unification ✅

**Script:** `pipeline/scripts/unify_datasets.py`

**What it does:**
- Downloads HAM10000 and ISIC 2019 metadata from GCS
- One-hot encodes labels for 6 target classes
- Filters out unwanted classes (vasc, SCC, UNK)
- Deduplicates images (9,676 overlaps found)
- Outputs: `unified_metadata.csv` (24,647 rows)

**Output location:** `gs://dermatlas-ml-data/processed/unified_metadata.csv`

**Issues resolved:**
- Fixed float formatting in print statements
- Handled 9,676 duplicate image_ids between datasets (kept first occurrence)

### 2.2 Embedding Generation ⚠️ PARTIALLY COMPLETE

**Script:** `pipeline/scripts/generate_embeddings.py`

**What it does:**
- Generates 1408-D embeddings using Vertex AI `multimodalembedding@001`
- Parallelized with ThreadPoolExecutor (configurable workers)
- Builds HAM10000 location cache (images split across part_1 and part_2 folders)
- Saves checkpoints every 100 images
- **Auto-uploads to GCS** and removes local copies (GCS is source of truth)

**Current Status:**
- ✅ **12,636 embeddings generated** (51.3% of dataset)
- ✅ All 10,015 HAM10000 images succeeded
- ❌ 12,011 ISIC images failed (Vertex AI quota limits)

**Output files (in GCS):**
- `gs://dermatlas-ml-data/processed/embeddings.npy` (12636, 1408)
- `gs://dermatlas-ml-data/processed/labels.npy` (12636, 6)
- `gs://dermatlas-ml-data/processed/image_ids.npy` (12636,)

**Why only 51% completed:**
- Hit Vertex AI quota limit: 600 requests/min for multimodalembedding
- Even with 10 workers, exceeded quota and got 429 errors
- **Quota increase request submitted** (6,000 req/min) - awaiting Google approval (1-2 business days)

**Issues resolved:**
- Fixed ISIC path (nested subdirectory: `ISIC_2019_Training_Input/ISIC_2019_Training_Input/`)
- Fixed data type conversion (CSV had string "True"/"False" instead of 0/1)
- Added parallelization with ThreadPoolExecutor
- Changed to auto-upload to GCS (no more interactive prompts)

**Key insight:**
- Row index `i` across all three arrays (embeddings, labels, image_ids) refers to the same image
- This bijection is critical for training and retrieval

---

## 📋 Phase 3: XGBoost Training (NEXT)

**Goal:** Train XGBoost classifier with per-class threshold tuning

**What needs to be done:**

### 3.1 Create Training Script
**File:** `pipeline/scripts/train_xgboost.py`

**Requirements:**
1. Load embeddings from GCS:
   - `gs://dermatlas-ml-data/processed/embeddings.npy`
   - `gs://dermatlas-ml-data/processed/labels.npy`
   - `gs://dermatlas-ml-data/processed/image_ids.npy`

2. Train/val/test split (stratified by class):
   - 70% train, 15% val, 15% test

3. Handle class imbalance:
   - Use `scale_pos_weight` or sample weights
   - Class distribution: nv=67%, mel=11%, bcc=5%, bkl=11%, akiec=3%, df=1%

4. XGBoost configuration:
   - Objective: `multi:softprob` (outputs full probability distribution)
   - Eval metric: recall per class
   - Early stopping on validation set

5. Per-class threshold tuning:
   - Use validation set to tune thresholds
   - **Clinical targets:**
     - mel (melanoma) recall ≥ 0.95
     - bcc (basal cell carcinoma) recall ≥ 0.92
     - Macro recall ≥ 0.85
   - Accept precision trade-off for high recall on malignant classes

6. Save model artifacts to GCS:
   - `model.json` (XGBoost model)
   - `label_encoder.pkl` (maps class indices to names)
   - `thresholds.pkl` (per-class decision thresholds)
   - Upload to: `gs://dermatlas-ml-data/models/xgboost-v1.0/`

7. Validation metrics to track:
   - Per-class recall, precision, F1
   - Confusion matrix
   - ROC curves (one-vs-rest for each class)
   - Overall accuracy

**Expected performance:**
- With 12,636 images, model should be trainable but may not hit clinical targets
- Re-train with full 24,647 images after quota approval for production-ready model

### 3.2 Model Artifacts Structure
```
gs://dermatlas-ml-data/models/xgboost-v1.0/
├── model.json                 # XGBoost model
├── label_encoder.pkl          # Class name mapping
├── thresholds.pkl             # Per-class decision thresholds
├── metadata.json              # Training info (date, dataset size, metrics)
└── validation_report.txt      # Detailed validation metrics
```

---

## 📋 Phase 4: Vertex Vector Search (AFTER PHASE 3)

**Goal:** Deploy embeddings to Vertex Vector Search for fast nearest-neighbor retrieval

**Steps:**
1. Export embeddings to JSONL format (Vertex Vector Search format)
2. Upload JSONL to GCS
3. Create Vertex AI Vector Search index
4. Create index endpoint
5. Deploy index to endpoint
6. Test k-NN queries

---

## 📋 Phase 5: FastAPI Integration (AFTER PHASE 4)

**Goal:** Integrate XGBoost + Vector Search into FastAPI backend

**Components to create:**
1. `server/app/ml/model_loader.py` - DermAtlasModel class for prediction
2. `server/app/ml/vertex_client.py` - Wrapper for Vertex AI embedding + vector search
3. `server/app/api/api_v1/endpoints/lesion.py` - `POST /api/v1/lesion/analyze` endpoint
4. `server/app/schemas/analyze.py` - Pydantic request/response models

**Analyze endpoint flow:**
1. Receive uploaded clinical image
2. Generate 1408-D embedding via Vertex AI
3. Run XGBoost prediction → get probability distribution
4. Apply per-class thresholds → determine risk flag
5. Query Vertex Vector Search → retrieve top-k similar cases
6. Return: probabilities, risk flag, similar cases with metadata

---

## 🚧 Known Issues / Blockers

1. **Vertex AI Quota (ACTIVE BLOCKER):**
   - Current: 600 requests/min
   - Requested: 6,000 requests/min
   - Status: Awaiting Google approval (1-2 business days)
   - Impact: Can only train with 12,636 images (51% of dataset) until approved

2. **Dataset Imbalance:**
   - nv: 67% (over-represented)
   - df: 1% (severely under-represented)
   - Mitigation: Use sample weights + per-class threshold tuning

---

## 📁 Key File Locations

**Pipeline Scripts:**
- `pipeline/scripts/unify_datasets.py` (dataset merging)
- `pipeline/scripts/generate_embeddings.py` (embedding generation)
- `pipeline/scripts/train_xgboost.py` (TO BE CREATED - Phase 3)

**GCS Bucket Structure:**
```
gs://dermatlas-ml-data/
├── raw/
│   ├── HAM10000/HAM10000/
│   │   ├── HAM10000_images_part_1/
│   │   ├── HAM10000_images_part_2/
│   │   └── HAM10000_metadata.csv
│   └── ISIC/ISIC/
│       ├── ISIC_2019_Training_Input/ISIC_2019_Training_Input/
│       └── ISIC_2019_Training_GroundTruth.csv
├── processed/
│   ├── unified_metadata.csv
│   ├── embeddings.npy (12636, 1408)
│   ├── labels.npy (12636, 6)
│   └── image_ids.npy (12636,)
└── models/
    └── xgboost-v1.0/ (TO BE CREATED)
```

**Server Files:**
- `server/app/models/clinical_image_prediction.py` (ORM model for predictions)
- `server/alembic/versions/b7c3d8e21fa9_*.py` (pgvector migration)

---

## 🎯 Immediate Next Steps

1. **Create XGBoost training script** (`pipeline/scripts/train_xgboost.py`)
2. **Train model on 12,636 embeddings** (while waiting for quota)
3. **Evaluate if 51% dataset is sufficient** for demo/proof-of-concept
4. **Re-train with full 24,647 dataset** once quota approved
5. **Proceed to Phase 4** (Vertex Vector Search) after training

---

## 💡 Summary for Claude

**When resuming this project, here's what you need to know:**

- **Phase 1 & 2 are complete** (database schema + partial embeddings)
- **You have 12,636 usable embeddings** ready for training in GCS
- **Quota request is pending** - can get remaining 12,011 embeddings later
- **Start Phase 3:** Create XGBoost training script with per-class threshold tuning
- **Clinical targets:** mel ≥0.95 recall, bcc ≥0.92 recall, macro ≥0.85 recall
- **All artifacts auto-upload to GCS** - local copies are temporary

**To begin Phase 3, start by creating:** `pipeline/scripts/train_xgboost.py`
