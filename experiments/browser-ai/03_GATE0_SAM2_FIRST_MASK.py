#!/usr/bin/env python3
"""Gate 0 ONLY: pinned local SAM2.1 real single-point image segmentation.
No network, downloads, edits to certified files, Docker or live research state.
Photo stays local. Output PNGs and JSON in D:\HS_SAM2_GATE0\output.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

REV = "de431c4043854a71d8101e17995dfe596bf101a5"
EXPECTED_HASH = "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
EXPECTED_BYTES = 155908064
OUTPUT_ROOT = Path(r"D:\HS_SAM2_GATE0\output")

def fail(msg):
    print("GATE0 FAIL:", msg, file=sys.stderr)
    sys.exit(1)

def main():
    ap = argparse.ArgumentParser(description="SAM2 real local checkpoint first-mask test")
    ap.add_argument("--image", help="Local PNG or JPG garment photo")
    ap.add_argument("--x", type=int, help="Positive click horizontal pixel coordinate")
    ap.add_argument("--y", type=int, help="Positive click vertical pixel coordinate")
    ap.add_argument("--sam-snapshot", help="Existing pinned snapshot folder, no downloads")
    args = ap.parse_args()
    snapshot = Path(args.sam_snapshot or (
        Path.home() / ".cache" / "huggingface" / "hub"
        / "models--facebook--sam2.1-hiera-tiny" / "snapshots" / REV
    ))
    if snapshot.name != REV:
        fail("Snapshot revision mismatch; locked checkpoint required.")
    weights = snapshot / "model.safetensors"
    if not weights.is_file() or weights.stat().st_size != EXPECTED_BYTES:
        fail("Pinned weight file absent or size mismatch.")
    h = hashlib.sha256()
    with weights.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    if h.hexdigest() != EXPECTED_HASH:
        fail("Pinned weight SHA256 mismatch.")
    print("PINNED SAM2 WEIGHT VERIFIED:", h.hexdigest(), flush=True)
    try:
        import torch
        import numpy as np
        from PIL import Image
        from transformers import Sam2Model, Sam2Processor
    except Exception as exc:
        fail(f"Dependencies missing or incompatible: {exc}")
    raw_path = args.image or input("Absolute local JPG/PNG photo path: ").strip().strip('"')
    image_path = Path(raw_path)
    if not image_path.is_file():
        fail(f"Photo not found: {image_path}")
    with Image.open(image_path) as opened:
        if opened.format not in ("PNG", "JPEG"):
            fail("Only JPG/PNG supported.")
        image = opened.convert("RGB")
    w, ht = image.size
    if w * ht > 1600000:
        fail(f"Photo too large ({w}x{ht}); please create a <=1.6MP copy on D: first.")
    print(f"PHOTO: {w} x {ht} px", flush=True)
    x = args.x if args.x is not None else int(input(f"Click X in pixels [0..{w-1}]: "))
    y = args.y if args.y is not None else int(input(f"Click Y in pixels [0..{ht-1}]: "))
    if not (0 <= x < w and 0 <= y < ht):
        fail("Point outside photo bounds.")
    t0 = time.perf_counter()
    model = Sam2Model.from_pretrained(str(snapshot), local_files_only=True).to("cpu").eval()
    processor = Sam2Processor.from_pretrained(str(snapshot), local_files_only=True)
    print(f"LOAD_SEC: {time.perf_counter()-t0:.3f}", flush=True)
    inputs = processor(
        images=image,
        input_points=[[[[x,y]]]],
        input_labels=[[[1]]],
        return_tensors="pt",
    ).to(model.device)
    t1 = time.perf_counter()
    with torch.inference_mode():
        outputs = model(**inputs, multimask_output=True)
    masks = processor.post_process_masks(outputs.pred_masks.cpu(), inputs["original_sizes"])[0]
    infer_secs = time.perf_counter()-t1
    scores = outputs.iou_scores.detach().float().cpu().reshape(-1).numpy()
    if not np.isfinite(scores).all():
        fail("Non-finite predicted IoU.")
    candidate_masks = masks.reshape(-1, ht, w)
    if len(candidate_masks) != len(scores):
        fail("Mask candidates / predicted IoU count mismatch.")
    best = int(np.argmax(scores))
    binary = candidate_masks[best].detach().cpu().numpy() > 0
    if not binary.any():
        fail("Empty mask; use another positive point.")
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    name = "sam2_gate0_" + time.strftime("%Y%m%d_%H%M%S")
    mask_image = Image.fromarray((binary.astype(np.uint8)*255), mode="L")
    mask_path = OUTPUT_ROOT / (name+"_mask.png")
    overlay_path = OUTPUT_ROOT / (name+"_overlay.png")
    report_path = OUTPUT_ROOT / (name+"_report.json")
    mask_image.save(mask_path)
    overlay = image.copy().convert("RGBA")
    color = Image.new("RGBA", image.size, (132, 81, 220, 110))
    overlay.paste(color, (0,0), mask_image)
    overlay.save(overlay_path)
    report = {
        "kind":"REAL_LOCAL_SAM2_SINGLE_POINT_GATE0",
        "checkpoint_revision":REV,
        "checkpoint_sha256":h.hexdigest(),
        "image_width":w,"image_height":ht,"point_x":x,"point_y":y,
        "model":"facebook/sam2.1-hiera-tiny",
        "torch_version":torch.__version__,
        "device":"cpu",
        "inference_sec":round(infer_secs,3),
        "selected_candidate":best,
        "predicted_iou_not_accuracy":[float(s) for s in scores],
        "selected_area_ratio":round(float(binary.mean()),6),
        "mask_png":str(mask_path),"overlay_png":str(overlay_path),
        "actual_photo_semantic_quality_verified":False,
        "latest_sites_end_to_end_verified":False,
        "research_authority":False
    }
    report_path.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    print("GATE0 ACTUAL SAM2 OUTPUT:",overlay_path)
    print("MASK:",mask_path)
    print("REPORT:",report_path)
    print("INFERENCE_SECONDS:",report["inference_sec"])
    print("NOT YET verified: mask visual quality, latest Sites integration, recolor or export.")

if __name__=="__main__":
    main()
