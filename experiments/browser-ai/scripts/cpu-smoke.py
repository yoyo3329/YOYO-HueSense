"""Optional Linux-only evidence reproduction. Not a service, Windows bridge or browser test.
Usage: python scripts/cpu-smoke.py /scratch/path/to/verified-models
Requires numpy + onnxruntime installed in an isolated scratch environment.
Only generates synthetic input; does not read research data or export weights.
"""
import hashlib
import json
from pathlib import Path
import sys
import time
import numpy as np
import onnxruntime as ort

root = Path(sys.argv[1])
specs = {
    "sam2.1_hiera_tiny.encoder.ort": "a987ec27f61a8d732516a543cbb306cd81c56e845321337e190b1848a54f0d5b",
    "sam2.1_hiera_tiny.decoder.onnx": "c40f5aa7d37b681cd500481a85d44839fd81c93dce1e86271a2c866470d22105",
}
report = {"kind": "REAL_MODEL_LINUX_CPU_SYNTHETIC_SMOKE", "runtime": ort.__version__,
          "browser_webgpu_pass": False, "quality_validated": False,
          "research_parity_validated": False, "checks": [], "models": specs}
for filename, expected in specs.items():
    assert hashlib.sha256((root / filename).read_bytes()).hexdigest() == expected
report["checks"].append("SHA256 of both model binaries")
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
encoder = ort.InferenceSession(str(root / next(iter(specs))), options, providers=["CPUExecutionProvider"])
decoder = ort.InferenceSession(str(root / "sam2.1_hiera_tiny.decoder.onnx"), options, providers=["CPUExecutionProvider"])
rgb = np.empty((1024, 1024, 3), dtype=np.float32)
rgb[:] = [220, 225, 230]
rgb[256:768, 256:768] = [210, 45, 60]
image = ((rgb / 255 - np.array([.485, .456, .406], dtype=np.float32)) /
         np.array([.229, .224, .225], dtype=np.float32)).transpose(2, 0, 1)[None]
start = time.perf_counter()
embedding = dict(zip([o.name for o in encoder.get_outputs()], encoder.run(None, {"image": image})))
report["encoder_ms"] = round((time.perf_counter() - start) * 1000, 2)
assert all(np.isfinite(v).all() for v in embedding.values())
report["checks"].append("Actual encoder forward pass: finite features")
feedback = np.zeros((1, 1, 256, 256), dtype=np.float32)
report["decodes"] = []
for name, points, labels, refine in [
    ("positive", [[512, 512]], [1], False),
    ("positive_negative_box_feedback", [[205,205],[819,819],[512,512],[50,50]], [2,3,1,0], True),
]:
    feeds = {**embedding, "point_coords": np.array([points], dtype=np.float32),
             "point_labels": np.array([labels], dtype=np.float32),
             "mask_input": feedback, "has_mask_input": np.array([int(refine)], dtype=np.float32)}
    start = time.perf_counter()
    output = dict(zip([o.name for o in decoder.get_outputs()], decoder.run(None, feeds)))
    masks, scores = output["masks"], output["iou_predictions"]
    assert masks.shape == (1, 3, 256, 256) and scores.shape == (1, 3)
    assert np.isfinite(masks).all() and np.isfinite(scores).all()
    index = int(np.argmax(scores[0]))
    feedback = masks[:, index:index + 1].copy()
    report["decodes"].append({"case": name, "ms": round((time.perf_counter()-start)*1000,2),
                              "mask_shape": list(masks.shape), "scores": scores.tolist(),
                              "foreground_pixels_256": int((feedback > 0).sum())})
report["checks"].append("Actual decoder: positive, negative, box and mask feedback; cached encoder outputs")
report["status"] = "PASS"
print(json.dumps(report, indent=2))
