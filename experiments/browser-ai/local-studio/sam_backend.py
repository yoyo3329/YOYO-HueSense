"""Pinned SAM2.1 local interactive inference. No model download or research writes."""
from __future__ import annotations
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import time

REVISION = "de431c4043854a71d8101e17995dfe596bf101a5"
HASH = "48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7"
BYTES = 155908064
MODEL_ID = "facebook/sam2.1-hiera-tiny"
PACKAGES = {"torch":"2.13.0", "torchvision":"0.28.0", "transformers":"5.15.1",
            "huggingface-hub":"1.31.0", "numpy":"2.4.6", "Pillow":"12.3.0",
            "safetensors":"0.8.0"}

def verified_snapshot(explicit=None):
    snapshot = Path(explicit) if explicit else (Path.home()/".cache"/"huggingface"/"hub" /
        "models--facebook--sam2.1-hiera-tiny"/"snapshots"/REVISION)
    if snapshot.name != REVISION:
        raise RuntimeError("SAM2_REVISION_MISMATCH")
    snapshot = snapshot.resolve(strict=True)
    weight = snapshot/"model.safetensors"
    if weight.stat().st_size != BYTES:
        raise RuntimeError("SAM2_WEIGHT_SIZE_MISMATCH")
    digest = hashlib.sha256()
    with weight.open("rb") as f:
        for part in iter(lambda: f.read(1024*1024), b""):
            digest.update(part)
    if digest.hexdigest() != HASH:
        raise RuntimeError("SAM2_WEIGHT_HASH_MISMATCH")
    if not (snapshot/"config.json").is_file() or not (snapshot/"preprocessor_config.json").is_file():
        raise RuntimeError("SAM2_SNAPSHOT_CONFIG_MISSING")
    return snapshot

def assert_dependencies():
    for name, pinned in PACKAGES.items():
        try:
            version = importlib.metadata.version(name).split("+")[0]
        except importlib.metadata.PackageNotFoundError as exc:
            raise RuntimeError(f"SAM2_MISSING_PACKAGE: {name}") from exc
        if version != pinned:
            raise RuntimeError(f"SAM2_VERSION_MISMATCH: {name} installed {version}; expected {pinned}")

def encode_runs(mask):
    """Row-major foreground [start,length] runs, not COCO and not alternating counts."""
    import numpy as np
    flat = np.asarray(mask, dtype=bool).reshape(-1)
    changes = np.flatnonzero(np.diff(np.r_[False, flat, False].astype(np.int8)))
    return [[int(a), int(b-a)] for a,b in changes.reshape(-1,2)]

class SamBackend:
    def __init__(self, snapshot_path=None):
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        self.snapshot = verified_snapshot(snapshot_path)
        assert_dependencies()
        import torch
        import numpy as np
        from transformers import Sam2Model, Sam2Processor
        self.torch = torch
        self.np = np
        torch.set_num_threads(min(6, max(1,(os.cpu_count() or 4)-1)))
        began = time.perf_counter()
        self.model = Sam2Model.from_pretrained(str(self.snapshot),local_files_only=True).to("cpu").eval()
        self.processor = Sam2Processor.from_pretrained(str(self.snapshot),local_files_only=True)
        self.load_seconds = round(time.perf_counter()-began,3)

    def health(self):
        return {
            "ready":True, "identity_verified":True, "model":MODEL_ID,
            "revision":REVISION, "weight_sha256":HASH, "device":"cpu",
            "load_seconds":self.load_seconds,
        }

    def segment(self, image, points, box):
        w,h=image.size
        inputs_kw={"images":image, "return_tensors":"pt"}
        if points:
            # Coordinates are independently normalized against original preview dimensions.
            inputs_kw["input_points"]=[[[[p["x"]*(w-1),p["y"]*(h-1)] for p in points]]]
            inputs_kw["input_labels"]=[[[p["label"] for p in points]]]
        if box:
            inputs_kw["input_boxes"]=[[[box[0]*(w-1),box[1]*(h-1),
                                      box[2]*(w-1),box[3]*(h-1)]]]
        began=time.perf_counter()
        inputs=self.processor(**inputs_kw)
        with self.torch.inference_mode():
            output=self.model(**inputs,multimask_output=True)
        sizes=inputs["original_sizes"]
        masks=self.processor.post_process_masks(output.pred_masks.cpu(),sizes)[0]
        scores=output.iou_scores.detach().float().cpu().reshape(-1).numpy()
        if len(scores)==0 or not self.np.isfinite(scores).all():
            raise RuntimeError("SAM2_INVALID_IOU_PREDICTIONS")
        masks=masks.reshape(-1,h,w)
        if len(masks)!=len(scores):
            raise RuntimeError("SAM2_CANDIDATE_SHAPE_MISMATCH")
        best=int(self.np.argmax(scores))
        mask=(masks[best].detach().cpu().numpy()>0)
        if not mask.any():
            raise ValueError("EMPTY_MASK: 請點選物件內部或加入更多提示點")
        return {
            "mask":{"type":"rle","width":w,"height":h,"runs":encode_runs(mask)},
            "predicted_iou":float(scores[best]),
            "candidate_count":len(scores),
            "area_ratio":float(mask.mean()),
            "inference_ms":round((time.perf_counter()-began)*1000),
            "source":"SAM2_REAL_INFERENCE",
            "requires_confirmation":True,
            "research_authority":False,
        }
