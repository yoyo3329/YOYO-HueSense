#!/usr/bin/env python3
import argparse, json, platform, re
from pathlib import Path
from importlib import metadata

def version(pkg, import_name=None):
    try: return metadata.version(pkg)
    except Exception:
        try:
            if import_name:
                m=__import__(import_name); return str(getattr(m,'__version__','UNKNOWN'))
        except Exception: pass
    return None

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--out',required=True); a=ap.parse_args()
    out={
      'schema_version':'0.8a2.2',
      'role':'ENVIRONMENT_AUDIT_ONLY_NO_MODEL_INFERENCE',
      'python':platform.python_version(),
      'platform':platform.platform(),
      'packages':{},
      'torchvision_torch_requirement':None,
      'torch_torchvision_compatibility':'UNKNOWN',
      'openclip_model_config':{},
      'quickgelu_fingerprint':{},
      'warnings':[]
    }
    for p,im in [('torch','torch'),('torchvision','torchvision'),('open-clip-torch','open_clip'),('transformers','transformers'),('numpy','numpy'),('Pillow','PIL')]:
        out['packages'][p]=version(p,im)
    try:
        reqs=metadata.requires('torchvision') or []
        req=next((x for x in reqs if re.match(r'^torch(\s|[<>=!~])',x,re.I)),None)
        out['torchvision_torch_requirement']=req
        tv=out['packages'].get('torchvision'); th=out['packages'].get('torch')
        if req and th:
            try:
                from packaging.requirements import Requirement
                r=Requirement(req)
                out['torch_torchvision_compatibility']='PASS' if th in r.specifier else 'WARNING_MISMATCH'
            except Exception: out['torch_torchvision_compatibility']='UNVERIFIED'
        if out['torch_torchvision_compatibility']=='WARNING_MISMATCH': out['warnings'].append('TORCH_TORCHVISION_VERSION_MISMATCH')
    except Exception as e: out['warnings'].append('TORCHVISION_REQUIREMENT_INSPECTION_FAILED:'+str(e))
    try:
        import open_clip
        model_name='ViT-B-32'; pretrained='openai'
        cfg=open_clip.get_model_config(model_name) if hasattr(open_clip,'get_model_config') else None
        pcfg=open_clip.get_pretrained_cfg(model_name,pretrained) if hasattr(open_clip,'get_pretrained_cfg') else None
        out['openclip_model_config']={'model':model_name,'pretrained':pretrained,'model_config':cfg,'pretrained_config':pcfg}
        mq=(cfg or {}).get('quick_gelu') if isinstance(cfg,dict) else None
        pq=(pcfg or {}).get('quick_gelu') if isinstance(pcfg,dict) else None
        out['quickgelu_fingerprint']={'model_config_quick_gelu':mq,'pretrained_config_quick_gelu':pq,'status':'MATCH' if mq is not None and pq is not None and mq==pq else ('WARNING_MISMATCH' if mq is not None and pq is not None else 'RECORDED_BUT_PRETRAINED_EXPECTATION_UNAVAILABLE')}
        if out['quickgelu_fingerprint']['status']=='WARNING_MISMATCH': out['warnings'].append('OPENCLIP_QUICKGELU_MISMATCH')
    except Exception as e:
        out['warnings'].append('OPENCLIP_CONFIG_INSPECTION_FAILED:'+str(e))
    Path(a.out).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('ENV_AUDIT_READY warnings='+str(len(out['warnings'])))
if __name__=='__main__': main()
