# Model / Reproducibility Notes

SAM baseline: facebook/sam2.1-hiera-tiny.

At installation time the tool:
1. resolves the current repository revision,
2. downloads that exact revision,
3. hashes all safetensors files,
4. records preprocessor_config.json,
5. records torch / transformers / huggingface-hub / open-clip-torch / numpy / Pillow versions,
6. forces the run to use the pinned local snapshot.

This is a Foundation-mask baseline, not a Foundation-model upper bound.
Small-object misses may reflect preprocessing/model-capacity limits and must not be generalized into “Foundation segmentation is unsuitable”.

OpenCLIP ViT-B-32/openai is auxiliary evidence only. Cosine values are not probabilities and do not validate a region.
