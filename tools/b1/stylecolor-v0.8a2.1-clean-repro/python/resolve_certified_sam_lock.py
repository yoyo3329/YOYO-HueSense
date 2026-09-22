#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,hashlib,sys,platform,importlib.metadata as md
from pathlib import Path
EXPECTED_REV='de431c4043854a71d8101e17995dfe596bf101a5'
EXPECTED_WEIGHT_SHA='48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7'
REPO='facebook/sam2.1-hiera-tiny'
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
 return h.hexdigest()
def pv(x):
 try:return md.version(x)
 except:return None
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);a=ap.parse_args()
 from huggingface_hub import snapshot_download
 snap=Path(snapshot_download(repo_id=REPO,revision=EXPECTED_REV,allow_patterns=['*.safetensors','*.json','*.txt']))
 wf=snap/'model.safetensors'
 if not wf.exists(): raise SystemExit('CERT_FAIL SAM weight missing')
 got=sha(wf)
 if got!=EXPECTED_WEIGHT_SHA: raise SystemExit(f'CERT_FAIL SAM SHA mismatch {got}')
 pp=snap/'preprocessor_config.json'; prep=json.loads(pp.read_text(encoding='utf-8')) if pp.exists() else {}
 doc={'schema_version':'0.8a2.1-clean-repro','sam_repo_id':REPO,'requested_revision':EXPECTED_REV,'resolved_revision':EXPECTED_REV,
      'snapshot_path':str(snap.resolve()),'weight_files':[{'name':'model.safetensors','size':wf.stat().st_size,'sha256':got}],
      'preprocessor_config':prep,'expected_weight_sha256':EXPECTED_WEIGHT_SHA,
      'dependencies':{k:pv(k) for k in ['torch','torchvision','transformers','huggingface-hub','open-clip-torch','numpy','Pillow']},
      'python_version':sys.version,'platform':{'system':platform.system(),'release':platform.release(),'machine':platform.machine()},'certified':True}
 raw=json.dumps(doc,sort_keys=True,separators=(',',':')).encode();doc['lock_content_sha256']=hashlib.sha256(raw).hexdigest()
 Path(a.out).write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('SAM_LOCK_CERT_PASS revision='+EXPECTED_REV);print('WEIGHT_SHA256 '+got)
if __name__=='__main__':main()
