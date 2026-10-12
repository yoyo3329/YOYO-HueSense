# HueSense SAM2.1 local-first integration plan v1.1

Status: **PLAN + READ-ONLY PREFLIGHT ONLY**. Not proof of real inference, not a live-site deployment, and not a research certification. The scope is an isolated interactive studio experiment. Snapshot V2 remains **RED HOLD**.

## Objective and decision

First prove with **the user's already-pinned SAM2.1 checkpoint** on one real garment photo:
upload -> positive prompt -> negative prompt/box correction -> mask preview -> user confirmation -> recolor only selected pixels -> PNG/JSON export.

**Do not migrate Docker yet.** After end-to-end proof, add embedding cache, low-resolution logits refinement and candidate selection. Only after a working baseline should an independent Docker SAM2.1 adapter be evaluated for team reproducibility. Docker is a future target, not abandoned.

Preserve `feature/huesense-sites-sync`, 42 SVG templates, animation and Canvas functionality, existing research containers, Node.js installation, live Control Center, Queue, Gates, certification files, PR #2 (draft), and `main`. Do not publish GPT Sites or merge without separate approval.

## Grounded starting point (as of 2026-10-13)

- Production-like website backup: `feature/huesense-sites-sync`, commit `c0e7896d4652fd0e3c005c53c982ad70176bfc86`. Local same-origin preview at port **8778** was started with the isolated `HueSense_Sites_Docker_Integration_v0.2` adapter. This preview's OpenCLIP connection does **not** prove SAM2.
- Existing browser R&D branch: `feature/huesense-browser-ai-rnd`, initial commit `aba7450c603648ecc798f4c0fd5efe8b314e3d44`. Its independent WebGPU SAM2.1 community-ONNX experiments passed 23 offline tests, but real Chrome WebGPU evaluation and equivalence to the pinned research checkpoint remain unverified. Reuse independent UI-validation ideas; do **not** substitute its weights.
- Draft PR #2: `codex/huesense-local-ai-20261009`, has `services/studio-bridge/` Python loopback `/api/health`, `/api/segment`, `/api/score` and interactive frontend. Its test doubles are not real-model evidence. Current bridge launches SAM2 AND separately certified OpenCLIP together and serves `public/studio`, which may differ from newest `sites/.../source/dist`. Verify actual website version before using it as a visual acceptance surface.
- Pinned **SAM2**: `facebook/sam2.1-hiera-tiny` revision `de431c4043854a71d8101e17995dfe596bf101a5`, `model.safetensors` expected 155,908,064 bytes, SHA-256 `48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7` from `tools/b1/stylecolor-v0.8a2.1-clean-repro/certification/sam_lock.json`. User confirmed local blob file exists with correct size, but this session has not recomputed its SHA-256 or run SAM2 inference.
- Current Windows PATH Python: `Python311` in C: drive; `torch`, `transformers`, `Pillow` all NOT FOUND; `YOYO_PYTHON_EXE` unset. No compatible Windows Python environment has been identified. DO NOT claim PR2 Bridge is launchable now or run `pip install` on C:.
- Existing `yoyo-huesense-clip-service-1` Docker has `torch` and Pillow, but lacks `transformers`. The `huesense-studio-adapter-test` container has none of these libraries and has no SAM2 checkpoint mounted. The research Docker containers must not be modified.
- C: free ~22.2 GB, D: free ~591.1 GB as reported; Docker Desktop disk image currently resides at `C:\Users\liuq9\AppData\Local\Docker\wsl`. Do NOT trigger new heavy Docker image builds on C: or move Docker's WSL image while containers run.
- Existing OpenCLIP Docker model `ViT-B-32 / openai` must not be mislabeled as equivalent to separately locked `ViT-B-32-quickgelu / openai`.

## Gate 0 — First real SAM2.1 garment mask (highest priority)

1. Run `01_GATE0_READONLY.cmd` on Windows. Inspect interpreter and installed packages, existing pinned HF snapshot/blob, model hash, and available Git files. No downloads, installations, or Docker changes.
2. **STOP if the chosen Windows interpreter lacks torch, transformers, Pillow, safetensors or dependency versions differ.** First locate an existing suitable environment; if none exists, seek explicit permission for a new **isolated D:-drive venv** with wheel/cache/temp redirected to D:. Do not install into system Python on C:, and do not silently repurpose a research container.
3. Use the existing `facebook/sam2.1-hiera-tiny` snapshot with `local_files_only=True` and HF offline mode. Validate exact weight SHA-256, processor configuration, output dimensions, and real inference on a locally chosen garment photo; record latency, memory use and alignment. No image upload to external inference services.
4. Avoid coupling first SAM inference to PR #2's second OpenCLIP checkpoint. A **SAM2-only smoke entrypoint** in an isolated work area is preferable for the very first mask. Then reuse PR2's API contract and connect to the **latest HueSense dist UI** in a local loopback preview; do not pass off the older 8777 copy as the latest Sites UI.
5. Confirm mask in editor, manually correct if required, recolor only selected area, export PNG/JSON, and compare with original pixels. A success statement needs a real screenshot, inference log, and source model identity check.

**Gate 0 stop criterion:** if the real pinned checkpoint cannot load or output a plausible aligned garment mask, record the actual error and stop feature expansion. Do not replace it with a different model or a mock mask.

## Gate 1 — Optimize after a real baseline

- Extract Hugging Face SAM2 image embeddings and reuse for repeated prompts on **the same image**; cap cache to one active image initially. Invalidate on image/source dimension/hash/version change.
- Convert mask formats precisely: browser experiment `huesense-rle-v1` uses alternating row-major `counts`; current studio `type:'rle'` uses explicit `runs:[[start,length],...]`. Add round-trip tests and strict dimensions.
- Record first encode time, repeated prompt time, RAM use, cache hits and misses, and disable caching if correctness or memory becomes worse.

## Gate 2 — Quality and correction

- Verify exact Transformers version supports `input_masks` and low-resolution logits feedback; do not assume tensor shapes.
- Display multiple candidate masks when available; predicted IoU is **not ground-truth accuracy**.
- Keep positive/negative points, boxes, editable preview, brush correction, explicit user confirmation and stale-request invalidation.

## Gate 3 — Full local studio acceptance

- On **the latest Sites dist editor**: upload -> segment -> add/remove prompts -> confirm -> recolor -> A/B/C -> export PNG/JSON -> reopen. Check portrait, landscape, stale image changes, mask coordinates, unchanged outside pixels, and error handling.
- Run real-model test and UI tests separately. Offline/mock test PASS does not mean SAM2 real inference PASS.
- Keep local port 8778 and 8777 semantics distinct; reuse only a safely configured standalone preview. The public `chatgpt.site` URL cannot be assumed to call localhost directly.

## Gate 4 — Containerize only after Gate 0/3 proof

- Once the same real photo successfully completes SAM2 select -> correction -> confirm -> recolor -> PNG export, evaluate an **independent** Docker SAM2 container for team members. Bind the verified weights read-only and keep the same `POST /api/segment` contract.
- Docker Linux environment, dependencies, path/link handling, GPU and result parity require new validation. Do not rebuild/restart the three existing research containers or move the Docker WSL image without a separate, approved maintenance plan.
- Store only code, Dockerfile, version locks, .env.example and non-sensitive tests in Git. No private photographs, Hugging Face binary weights, model cache, tokens or large generated artifacts.

## Collaboration and acceptance record

Track separately: `environment_ready`, `sam_model_identity_verified`, `sam_real_inference_pass`, `latest_dist_integration_pass`, `recolor_export_pass`, `browser_model_parity_pass` (optional), `docker_parity_pass` (later).

Initially all **real-inference, end-to-end, parity and Docker acceptance statuses are NOT VERIFIED**. Preserve source commit/branch references and concrete failure logs; no gate status changes are authorized.

### Reference implementation paths

- Browser frontend experiments: `experiments/browser-ai/`
- Existing PR2 bridge (read/reuse concept, not merge): `services/studio-bridge/`
- Latest backed-up site editor: `sites/huesense-color-studio/source/dist/editor/`
- Research model identity file (read-only): `tools/b1/stylecolor-v0.8a2.1-clean-repro/certification/sam_lock.json`
- Public upstream docs: https://huggingface.co/docs/transformers/model_doc/sam2 and https://github.com/facebookresearch/sam2
