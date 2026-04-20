import numpy as np

def load_embedding(path: str):
    """
    Load a NumPy embedding file (.npy) and return the vector.
    """
    embedding = np.load(path)

    print("Loaded embedding from:", path)
    print("Shape:", embedding.shape)
    print("Data type:", embedding.dtype)

    # If it's a 2D array like (1, 1408), flatten it
    if len(embedding.shape) > 1:
        embedding = embedding.flatten()
        print("Flattened shape:", embedding.shape)

    return embedding


if __name__ == "__main__":
    path = "/Users/nicholasalamir/Downloads/processed_embeddings.npy"  # change if needed
    vector = load_embedding(path)

    print("Vector length:", len(vector))
    print("First 10 values:", vector[:10])