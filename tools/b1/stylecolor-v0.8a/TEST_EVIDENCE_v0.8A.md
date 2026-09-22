# YOYO StyleColor Extractor v0.8-A — Build-time Test Evidence

This package was tested before packaging.

## Contract / unit tests

- 9/9 static research-boundary checks PASS
- Python synthetic region-worker test PASS
- Local region-crop → mock CLIP bridge test PASS
- 12/12 generated-output gates PASS

## Real 24-image B1 integration test

Input: the project's actual `y2k_color_mvp_b1_observations.json` plus its cached B1 images.

Result (CLIP intentionally OFF in the build environment so region extraction could be isolated):

- images: **24/24 processed**
- input failures: **0**
- regions: **317**
- evidence-only color candidates: **634**
- low-reliability candidates: **14**
- hard STYLE / NOT_STYLE classifications: **0**
- semantic-segmentation claim: **false**
- Style Graph built: **false**

Region count diagnostic:

- min 1
- p25 9
- median 13
- p75 17
- max 23
- mean 13.21

## Determinism check

Two complete 24-image runs with CLIP OFF produced byte-identical scientific JSON outputs:

- `region_observations.json`  
  `facd2c441076e5b0ad8e47fa1b383528d47265b1b52942b4348d12f0fe07d5c3`
- `style_color_candidates.json`  
  `0ca97c71cee392f38c4ea5bd888fa7a42222e27f6adb88a14975f4429c2ccd71`
- `extractor_summary.json`  
  `66ff263179e1aa93fcec71473a3e1ace27b68f5910a01b5b6e497187dd5ea67f`

## CLIP scope of this build-time test

The build container did not run the user's actual `127.0.0.1:8765` CLIP service. The bridge itself was tested against a mock service, including serving a generated local crop over loopback HTTP and receiving a score.

The Windows one-chain installer will auto-detect / attempt to auto-start the user's existing CLIP service and record the real model/device/result counts in `run_manifest.json`.
