YOYO / HueSense — v0.8-A.2.1-CLEAN-REPRO
Clean Certified Inference Reproduction

PURPOSE
This is NOT a new StyleColor algorithm version.
It reproduces A.2.1 inference using a dedicated isolated inference venv, exact dependency pins, exact SAM2 revision/weight SHA, and explicit OpenCLIP QuickGELU architecture certification, then compares drift against the old uncertified A.2.1 run.

IMPORTANT SCIENTIFIC DISCLOSURE
The old A.2.1 run loaded ViT-B-32/openai and emitted a QuickGELU mismatch warning.
OpenAI pretrained CLIP weights expect QuickGELU. The certified reproduction therefore uses:
  ViT-B-32-quickgelu / openai
This is the intended architecture-consistency correction.
Therefore:
  - SAM geometry drift primarily tests environment/runtime reproducibility.
  - OpenCLIP embedding/semantic drift reflects clean environment PLUS the QuickGELU consistency correction.
Do not attribute OpenCLIP drift only to torch/environment.

INSTALL / RUN
Double-click:
  INSTALL_AND_RUN_A2_1_CLEAN_REPRO.cmd

TARGET
  C:\xampp\htdocs\color-search-test\tools\b1\stylecolor-v0.8a2.1-clean-repro

ISOLATED ENVIRONMENT
  .venv-inference
This package does NOT use C:\clip-service\venv for inference. It only uses that existing Python as a bootstrap to create the dedicated venv.

EXACT PINS
  torch 2.13.0
  torchvision 0.28.0
  open-clip-torch 3.3.0
  transformers 5.15.1
  accelerate 1.15.0
  huggingface-hub 1.31.0
  safetensors 0.8.0
  numpy 2.4.6
  Pillow 12.3.0

FAIL-FAST CERTIFICATION
Before 24-image inference:
  1. Exact dependency versions are checked.
  2. torchvision's declared torch requirement must be satisfied.
  3. SAM2 revision must equal de431c4043854a71d8101e17995dfe596bf101a5.
  4. SAM2 model.safetensors SHA256 must equal 48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7.
  5. OpenCLIP model must be ViT-B-32-quickgelu / openai.
  6. Actual instantiated model must contain QuickGELU modules.
  7. OpenCLIP state-dict SHA256 must equal a3ce3c4a2245ed2a572d2eb864a62f0a4ca62b3123b83f8a52a523c3b1dd32a4.
  8. Pre/post pip-freeze fingerprints must be identical.

DRIFT OUTPUT
The clean run creates:
  drift/drift_comparison.json
  drift/drift_report.html

It compares:
  SAM geometry drift
    mask counts
    best-IoU matching
    mutual-best matching
    containment counts
    critical-case stability artifacts

  OpenCLIP drift
    same-geometry mask embedding cosine
    semantic score-vector delta
    Y2K similarity delta

  Graph drift
    mapped visual-neighbor edge retention
    neighbor-margin delta

NO AUTOMATIC EVIDENCE VALIDATION
Final status is intentionally:
  CLEAN_CERTIFIED_INFERENCE_REPRODUCTION_COMPLETE_DRIFT_REVIEW_REQUIRED

After reviewing drift, choose one interpretation:
  A. Near-identical: prior issue mainly certification/provenance debt.
  B. SAM stable, embedding shifts: regenerate embedding/semantic evidence from certified run.
  C. SAM geometry shifts: rebuild downstream QC from certified Foundation evidence.

No Style Graph. No production authority. No human quiz.
