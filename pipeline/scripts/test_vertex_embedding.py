import time
import vertexai
from vertexai.language_models import TextEmbeddingModel
from vertexai.vision_models import Image, MultiModalEmbeddingModel

PROJECT_ID = "dermatlas"
REGION = "us-central1"

vertexai.init(project=PROJECT_ID, location=REGION)

print("Loading embedding model...")
model = MultiModalEmbeddingModel.from_pretrained(
    "multimodalembedding@001"
)

# IMPORTANT: use Image class from vision_models (NOT preview)
image = Image(
    gcs_uri="gs://dermatlas-reference-atlas/lesion1.jpeg"
)

print("Requesting embedding...")
start = time.time()

embeddings = model.get_embeddings(image=image)

elapsed = time.time() - start

vector = embeddings.image_embedding

print("Vector length:", len(vector))
print("First 10 values:", vector[:10])
print("Time taken (seconds):", round(elapsed, 3))