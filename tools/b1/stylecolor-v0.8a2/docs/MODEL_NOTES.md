# Model notes

Foundation mask: `facebook/sam2.1-hiera-tiny` through Hugging Face Transformers mask-generation pipeline. It is used as a generic mask prior only, not semantic/object ground truth.

Visual representation: OpenCLIP `ViT-B-32 / openai`, loaded with the existing local CLIP Python environment. Semantic prompt cosine scores are evidence vectors, not probabilities.

CPU profile: `points_per_crop=12`, `points_per_batch=16`, no extra crop layers. First real run downloads the SAM2 weights and can take several minutes across 24 images on CPU. Per-image outputs are resumable.
