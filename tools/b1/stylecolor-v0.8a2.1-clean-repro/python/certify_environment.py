#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,hashlib,platform,sys,subprocess,importlib.metadata as md
from pathlib import Path
from packaging.requirements import Requirement
from packaging.version import Version

EXPECTED={
 'torch':'2.13.0','torchvision':'0.28.0','open-clip-torch':'3.3.0','transformers':'5.15.1',
 'accelerate':'1.15.0','huggingface-hub':'1.31.0','safetensors':'0.8.0','numpy':'2.4.6','Pillow':'12.3.0','packaging':'26.3'
}

def norm(v): return str(v).split('+')[0]
def sha_text(s): return hashlib.sha256(s.encode()).hexdigest()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--stage',required=True,choices=['pre','post']);a=ap.parse_args()
 actual={}
 errs=[]
 for k,v in EXPECTED.items():
  try: actual[k]=md.version(k)
  except Exception: actual[k]=None;errs.append(f'MISSING:{k}')
  if actual[k] and norm(actual[k])!=v: errs.append(f'VERSION_MISMATCH:{k}:{actual[k]}!={v}')
 try:
  import torch,torchvision,open_clip,transformers
  imports={'torch':torch.__version__,'torchvision':torchvision.__version__,'open_clip':getattr(open_clip,'__version__',None),'transformers':transformers.__version__}
 except Exception as e:
  imports={'error':repr(e)};errs.append('IMPORT_FAILURE:'+repr(e))
 # Verify torchvision's declared torch requirement against installed torch.
 tv_req=[]; tv_ok=True
 try:
  for r in md.requires('torchvision') or []:
   req=Requirement(r)
   if req.name.lower()=='torch':
    tv_req.append(str(req.specifier));
    if Version(norm(actual['torch'])) not in req.specifier: tv_ok=False
 except Exception as e:
  tv_ok=False;errs.append('TORCHVISION_REQUIREMENT_PARSE:'+repr(e))
 if not tv_ok: errs.append('TORCH_TORCHVISION_INCOMPATIBLE')
 freeze=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True,errors='replace')
 doc={'schema_version':'0.8a2.1-clean-repro','stage':a.stage,'python_executable':sys.executable,'python_version':sys.version,
      'platform':{'system':platform.system(),'release':platform.release(),'machine':platform.machine()},'expected':EXPECTED,'actual':actual,'imports':imports,
      'torchvision_declared_torch_specifiers':tv_req,'torch_torchvision_requirement_satisfied':tv_ok,'pip_freeze':freeze.splitlines(),
      'pip_freeze_sha256':sha_text(freeze),'certification_errors':errs,'cleanly_certified':len(errs)==0}
 Path(a.out).write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('ENV_CERT_'+('PASS' if not errs else 'FAIL'))
 for e in errs: print('ERROR',e)
 sys.exit(0 if not errs else 31)
if __name__=='__main__': main()
