YOYO Safe Foundation v0.6C.1

Purpose:
Add a calibration-schema safety gate before any future cross-style perceptual labeling can be reused.

No human work is required.
No legacy labels are automatically changed.
No production runtime is enabled.

Run:
cd "C:\xampp\htdocs\color-search-test\tools\b1"
npm run safe:foundation

Expected headline:
=== YOYO Safe Foundation Sprint v0.6C.1 — Calibration-Safe Cross-Style One Chain ===

Important outputs:
- calibration_lineage_manifest_v0_6c1.json
- legacy_low_chroma_review_candidates_v0_6c1.json
- cross_style_dataset_registry_v0_6c1.json
- safe_foundation_integrity_audit_v0_6c1.json
- project_state_manifest_v0_6c1.json
- safe_foundation_sprint_report_v0_6c1.json

The legacy first-pass calibration file stays unchanged and historical-only.
The active v0.4 train and v0.5.2 holdout must pass the new label consistency contract.
