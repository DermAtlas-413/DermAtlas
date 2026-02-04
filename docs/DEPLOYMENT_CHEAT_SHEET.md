# DermAtlas Deployment Cheat Sheet

Quick reference for common deployment operations.

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- Docker installed (for local builds)
- Access to the GCP project

## Cloud Run Deployment

### Deploy New Version

```bash
# From project root
cd server

# Build and deploy in one command
gcloud run deploy dermatlas-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=your-project,GCS_BUCKET_NAME=your-bucket,VERTEX_AI_INDEX_ENDPOINT=your-endpoint"
```

### Deploy with Pre-built Image

```bash
# Build image
docker build -t gcr.io/YOUR_PROJECT/dermatlas-api:latest .

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT/dermatlas-api:latest

# Deploy from image
gcloud run deploy dermatlas-api \
  --image gcr.io/YOUR_PROJECT/dermatlas-api:latest \
  --region us-central1 \
  --platform managed
```

## Traffic Management

### Gradual Rollout

```bash
# Deploy new revision without traffic
gcloud run deploy dermatlas-api \
  --source . \
  --region us-central1 \
  --no-traffic

# Split traffic 50/50
gcloud run services update-traffic dermatlas-api \
  --region us-central1 \
  --to-revisions=REVISION1=50,REVISION2=50

# Full cutover to latest
gcloud run services update-traffic dermatlas-api \
  --region us-central1 \
  --to-latest
```

### Rollback

```bash
# List revisions
gcloud run revisions list \
  --service dermatlas-api \
  --region us-central1

# Rollback to specific revision
gcloud run services update-traffic dermatlas-api \
  --region us-central1 \
  --to-revisions=dermatlas-api-XXXXXX=100
```

## Vertex AI Vector Search

### Re-index (Placeholder)

```bash
# TODO: Add actual re-indexing command once implemented
# This will trigger a rebuild of the Vector Search index
# gcloud ai indexes update INDEX_ID ...
```

### Check Index Status

```bash
gcloud ai indexes describe INDEX_ID \
  --region us-central1 \
  --project YOUR_PROJECT
```

## Monitoring

### View Logs

```bash
# Stream logs
gcloud run logs tail dermatlas-api --region us-central1

# View recent logs
gcloud run logs read dermatlas-api \
  --region us-central1 \
  --limit 100
```

### Check Service Status

```bash
gcloud run services describe dermatlas-api \
  --region us-central1 \
  --format="value(status.url)"
```

## Environment Variables

### Update Environment Variables

```bash
gcloud run services update dermatlas-api \
  --region us-central1 \
  --update-env-vars "DEBUG=false,NEW_VAR=value"
```

### View Current Config

```bash
gcloud run services describe dermatlas-api \
  --region us-central1 \
  --format="yaml(spec.template.spec.containers[0].env)"
```

## Useful Links

- [Cloud Run Python Tips](https://docs.cloud.google.com/run/docs/tips/python)
- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Vertex AI Vector Search](https://cloud.google.com/vertex-ai/docs/vector-search/overview)
