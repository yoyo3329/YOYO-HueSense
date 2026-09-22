# v0.8-A One-Chain Architecture

```text
Existing B1 (24 decoded-pixel observations + local image cache)
        |
        v
Node Orchestrator
  - input/hash manifest
  - batch lifecycle
  - no production integration
        |
        v
Python CV Batch Worker (one process)
  - SLIC region proposal baseline
  - deterministic saliency proxy
  - OKLab / OKLCH region palette
  - shadow/highlight reliability flags
  - crop / mask / overlay assets
        |
        v
Local Region Crop Asset Server :8791
        |
        +----> Existing CLIP Service :8765 (auto-detect / auto-start if found)
                  - ViT-B-32 / openai from existing project
                  - region-level style similarity evidence only
        |
        v
Evidence Vector Assembly
  - region area
  - saliency proxy
  - CLIP style similarity (nullable)
  - illumination reliability
  - region stability
  - source CLIP score
        |
        v
Evidence-only Color Candidates
  - no hard STYLE / NOT_STYLE
  - no overall style scalar
  - provisional role only
        |
        v
Automated Diagnostics + Static audit.html
```

## Why batch Python?

Python imports for numpy / scikit-image are expensive on Windows. The 24 images are intentionally processed in **one Python process**, not 24 separate interpreter starts.

## Why existing CLIP service?

The project already has a fixed local CLIP service on `127.0.0.1:8765`. v0.8-A does not install a second 500MB+ model stack. Region crops are exposed only on loopback `127.0.0.1:8791`, and the existing service fetches them exactly like its existing URL inputs.

## Failure behavior

If CLIP is unavailable:

- the run does **not** invent scores;
- region CLIP becomes `null` / `UNAVAILABLE_SERVICE`;
- the region / palette / reliability pipeline still completes;
- summary is explicit about `clip_available=false`.

This makes CV extraction testable independently of model-service availability.
