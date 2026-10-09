"""Interactive adapter for the repository's pinned, local SAM2/OpenCLIP models.
No research runner, dataset, gate, or certification file is modified.
"""
from __future__ import annotations
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def check_environment(requirements):
    errors = []
    for line in Path(requirements).read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, expected = line.split('==', 1)
        try:
            actual = metadata.version(name).split('+')[0]
        except metadata.PackageNotFoundError:
            actual = 'MISSING'
        if actual != expected:
            errors.append(f'{name}: expected {expected}, found {actual}')
    if errors:
        raise RuntimeError('ENVIRONMENT_MISMATCH\n' + '\n'.join(errors))


def check_sam_snapshot(lock, snapshot):
    if lock.get('certified') is not True:
        raise RuntimeError('SAM_LOCK_NOT_CERTIFIED')
    snapshot = Path(snapshot).resolve(strict=True)
    if snapshot.name != lock['resolved_revision']:
        raise RuntimeError('SAM_SNAPSHOT_REVISION_MISMATCH')
    weights = lock.get('weight_files', [])
    if not weights:
        raise RuntimeError('SAM_LOCK_HAS_NO_WEIGHTS')
    for item in weights:
        p = (snapshot / item['name']).resolve(strict=True)
        # Hugging Face cache files may be symlinks into a sibling blobs directory.
        if not p.is_file() or p.stat().st_size != item['size'] or sha256_file(p) != item['sha256']:
            raise RuntimeError('SAM_WEIGHT_HASH_MISMATCH')
    return snapshot


class LocalModels:
    def __init__(self, sam_lock_path, clip_lock_path, requirements, clip_checkpoint, sam_snapshot=None):
        check_environment(requirements)
        self.sam_lock = json.loads(Path(sam_lock_path).read_text(encoding='utf-8'))
        self.clip_lock = json.loads(Path(clip_lock_path).read_text(encoding='utf-8'))
        snapshot = check_sam_snapshot(self.sam_lock, sam_snapshot or self.sam_lock['snapshot_path'])
        checkpoint = Path(clip_checkpoint).resolve(strict=True)
        if not checkpoint.is_file():
            raise RuntimeError('OPENCLIP_LOCAL_CHECKPOINT_REQUIRED')
        if self.clip_lock.get('cleanly_certified') is not True:
            raise RuntimeError('OPENCLIP_LOCK_NOT_CERTIFIED')
        # No fallback network model downloads or silent environment upgrades.
        os.environ['HF_HUB_OFFLINE'] = '1'
        import torch
        import open_clip
        from transformers import Sam2Model, Sam2Processor
        self.torch = torch
        torch.set_num_threads(max(1, min(8, (os.cpu_count() or 4) - 1)))
        self.sam = Sam2Model.from_pretrained(str(snapshot), local_files_only=True).to('cpu').eval()
        self.processor = Sam2Processor.from_pretrained(str(snapshot), local_files_only=True)
        self.clip, _, self.preprocess = open_clip.create_model_and_transforms(
            self.clip_lock['model_name'], pretrained=str(checkpoint), device='cpu')
        self.clip.eval()
        self.tokenizer = open_clip.get_tokenizer(self.clip_lock['model_name'])
        quick = [n for n, m in self.clip.named_modules() if m.__class__.__name__.lower() == 'quickgelu']
        digest = hashlib.sha256()
        for name, tensor in sorted(self.clip.state_dict().items()):
            digest.update(name.encode())
            digest.update(tensor.detach().cpu().numpy().tobytes())
        if digest.hexdigest() != self.clip_lock['expected_state_dict_sha256']:
            raise RuntimeError('OPENCLIP_WEIGHT_HASH_MISMATCH')
        if len(quick) != self.clip_lock['quickgelu_module_count']:
            raise RuntimeError('OPENCLIP_QUICKGELU_MISMATCH')

    def health(self):
        return {'sam2': {'ready': True, 'model': self.sam_lock['sam_repo_id'],
                         'revision': self.sam_lock['resolved_revision']},
                'openclip': {'ready': True, 'model': self.clip_lock['model_name']},
                'device': 'cpu', 'model_identity_verified': True,
                'research_authority': False, 'b2_released': False}

    def segment(self, image, points, box):
        import numpy as np
        w, h = image.size
        args = {'images': image, 'return_tensors': 'pt'}
        if points:
            args['input_points'] = [[[[p['x'] * (w - 1), p['y'] * (h - 1)] for p in points]]]
            args['input_labels'] = [[[p['label'] for p in points]]]
        if box:
            args['input_boxes'] = [[[box[0] * (w - 1), box[1] * (h - 1),
                                      box[2] * (w - 1), box[3] * (h - 1)]]]
        inputs = self.processor(**args)
        with self.torch.inference_mode():
            output = self.sam(**inputs, multimask_output=True)
        masks = self.processor.post_process_masks(output.pred_masks.cpu(), inputs['original_sizes'])[0]
        scores = output.iou_scores.detach().cpu().reshape(-1).numpy()
        if not np.isfinite(scores).all() or not scores.size:
            raise RuntimeError('SAM2_INVALID_SCORES')
        best = int(np.argmax(scores))
        mask = masks.reshape(-1, h, w)[best].detach().cpu().numpy().astype(bool)
        if not mask.any():
            raise ValueError('EMPTY_MASK: 請新增正向點或修改框選範圍')
        return mask, float(scores[best])

    def score(self, image, texts):
        with self.torch.inference_mode():
            visual = self.clip.encode_image(self.preprocess(image).unsqueeze(0))
            textual = self.clip.encode_text(self.tokenizer(texts))
            visual = visual / visual.norm(dim=-1, keepdim=True).clamp_min(1e-12)
            textual = textual / textual.norm(dim=-1, keepdim=True).clamp_min(1e-12)
            scores = (visual @ textual.T).squeeze(0).tolist()
        return [{'text': text, 'cosine_similarity': float(score)} for text, score in zip(texts, scores)]
