#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,hashlib,sys,importlib.metadata as md
from pathlib import Path
MODEL='ViT-B-32-quickgelu';PRETRAINED='openai'
EXPECTED_WEIGHT_SHA='a3ce3c4a2245ed2a572d2eb864a62f0a4ca62b3123b83f8a52a523c3b1dd32a4'
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);a=ap.parse_args()
 import torch,open_clip
 pairs=set(tuple(x) for x in open_clip.list_pretrained())
 errs=[]
 if (MODEL,PRETRAINED) not in pairs: errs.append('MODEL_PRETRAINED_PAIR_NOT_REGISTERED')
 cfg=None
 try: cfg=open_clip.get_model_config(MODEL)
 except Exception as e: errs.append('MODEL_CONFIG_UNAVAILABLE:'+repr(e))
 cfg_quick=(cfg or {}).get('quick_gelu') if isinstance(cfg,dict) else None
 if cfg_quick is not True: errs.append(f'MODEL_CONFIG_QUICK_GELU_NOT_TRUE:{cfg_quick}')
 print('Loading certified OpenCLIP '+MODEL+'/'+PRETRAINED,flush=True)
 model,_,preprocess=open_clip.create_model_and_transforms(MODEL,pretrained=PRETRAINED,device='cpu');model.eval()
 qmods=[name for name,m in model.named_modules() if m.__class__.__name__.lower()=='quickgelu']
 if not qmods: errs.append('ACTUAL_MODEL_HAS_NO_QUICKGELU_MODULE')
 hh=hashlib.sha256()
 for name,t in sorted(model.state_dict().items()): hh.update(name.encode());hh.update(t.detach().cpu().numpy().tobytes())
 got=hh.hexdigest()
 if got!=EXPECTED_WEIGHT_SHA: errs.append(f'OPENCLIP_WEIGHT_SHA_MISMATCH:{got}')
 # deterministic tiny architecture signature, not a model-quality test
 arch={'model_name':MODEL,'pretrained':PRETRAINED,'model_config_quick_gelu':cfg_quick,'quickgelu_module_count':len(qmods),'quickgelu_module_sample':qmods[:8],
       'open_clip_version':getattr(open_clip,'__version__',md.version('open-clip-torch')),'torch_version':torch.__version__,'state_dict_sha256':got,
       'expected_state_dict_sha256':EXPECTED_WEIGHT_SHA,'certification_errors':errs,'cleanly_certified':len(errs)==0}
 Path(a.out).write_text(json.dumps(arch,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('OPENCLIP_CERT_'+('PASS' if not errs else 'FAIL'))
 for e in errs: print('ERROR',e)
 sys.exit(0 if not errs else 32)
if __name__=='__main__':main()
