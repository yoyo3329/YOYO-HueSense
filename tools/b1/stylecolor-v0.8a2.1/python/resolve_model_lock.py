#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, hashlib, os, platform, sys
from pathlib import Path

def sha256_file(p: Path):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):
            h.update(c)
    return h.hexdigest()

def pkgver(name):
    try:
        import importlib.metadata as md
        return md.version(name)
    except Exception:
        return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--config',required=True); ap.add_argument('--out',required=True)
    a=ap.parse_args(); cfg=json.loads(Path(a.config).read_text(encoding='utf-8'))
    from huggingface_hub import model_info, snapshot_download
    repo=cfg['foundation_mask']['model']
    info=model_info(repo_id=repo, revision='main')
    resolved=info.sha
    snap=Path(snapshot_download(repo_id=repo, revision=resolved, allow_patterns=['*.safetensors','*.json','*.txt']))
    weights=[]
    for p in sorted(snap.rglob('*.safetensors')):
        weights.append({'name':str(p.relative_to(snap)).replace('\\','/'),'size':p.stat().st_size,'sha256':sha256_file(p)})
    prep={}
    pp=snap/'preprocessor_config.json'
    if pp.exists():
        try: prep=json.loads(pp.read_text(encoding='utf-8'))
        except Exception: prep={'parse_error':True}
    deps={k:pkgver(k) for k in ['torch','transformers','huggingface-hub','open-clip-torch','numpy','Pillow']}
    lock={
      'schema_version':'0.8a2.1',
      'sam_repo_id':repo,
      'requested_revision':'main',
      'resolved_revision':resolved,
      'snapshot_path':str(snap.resolve()),
      'weight_files':weights,
      'preprocessor_config':prep,
      'python_version':sys.version,
      'platform':{'system':platform.system(),'release':platform.release(),'machine':platform.machine()},
      'dependencies':deps
    }
    raw=json.dumps(lock,sort_keys=True,separators=(',',':')).encode()
    lock['lock_content_sha256']=hashlib.sha256(raw).hexdigest()
    Path(a.out).write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('MODEL_LOCK_READY revision='+resolved)
    for w in weights: print('WEIGHT',w['name'],w['sha256'])
if __name__=='__main__': main()
