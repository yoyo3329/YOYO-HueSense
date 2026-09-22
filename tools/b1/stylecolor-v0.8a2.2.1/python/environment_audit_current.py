#!/usr/bin/env python3
import argparse,json,platform,re,sys
from pathlib import Path
from importlib import metadata

def ver(pkg,imp=None):
    try:return metadata.version(pkg)
    except Exception:
        try:
            if imp:
                m=__import__(imp);return str(getattr(m,'__version__','UNKNOWN'))
        except Exception:pass
    return None

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);a=ap.parse_args();o={'schema_version':'0.8a2.2.1','role':'CURRENT_POSTPROCESS_ENVIRONMENT_ONLY','python':platform.python_version(),'python_executable':sys.executable,'platform':platform.platform(),'packages':{},'torchvision_torch_requirement':None,'torch_torchvision_compatibility':'UNKNOWN','quickgelu_current_fingerprint':{},'warnings':[]}
    for p,im in [('torch','torch'),('torchvision','torchvision'),('open-clip-torch','open_clip'),('transformers','transformers'),('numpy','numpy'),('Pillow','PIL')]:o['packages'][p]=ver(p,im)
    try:
        reqs=metadata.requires('torchvision') or [];req=next((x for x in reqs if re.match(r'^torch(\s|[<>=!~])',x,re.I)),None);o['torchvision_torch_requirement']=req
        if req and o['packages'].get('torch'):
            from packaging.requirements import Requirement
            o['torch_torchvision_compatibility']='PASS' if o['packages']['torch'] in Requirement(req).specifier else 'WARNING_MISMATCH'
            if o['torch_torchvision_compatibility']!='PASS':o['warnings'].append('CURRENT_POSTPROCESS_TORCH_TORCHVISION_MISMATCH')
    except Exception as e:o['warnings'].append('CURRENT_TORCHVISION_INSPECTION_FAILED:'+str(e))
    try:
        import open_clip
        cfg=open_clip.get_model_config('ViT-B-32') if hasattr(open_clip,'get_model_config') else None;pcfg=open_clip.get_pretrained_cfg('ViT-B-32','openai') if hasattr(open_clip,'get_pretrained_cfg') else None
        mq=(cfg or {}).get('quick_gelu') if isinstance(cfg,dict) else None;pq=(pcfg or {}).get('quick_gelu') if isinstance(pcfg,dict) else None
        o['quickgelu_current_fingerprint']={'model_config_quick_gelu':mq,'pretrained_config_quick_gelu':pq,'status':'MATCH' if mq is not None and pq is not None and mq==pq else ('WARNING_MISMATCH' if mq is not None and pq is not None else 'INCOMPLETE_CURRENT_CONFIG')}
        if o['quickgelu_current_fingerprint']['status']=='WARNING_MISMATCH':o['warnings'].append('CURRENT_OPENCLIP_QUICKGELU_MISMATCH')
    except Exception as e:o['warnings'].append('CURRENT_OPENCLIP_INSPECTION_FAILED:'+str(e))
    Path(a.out).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('POSTPROCESS_ENV_AUDIT_READY warnings='+str(len(o['warnings'])))
if __name__=='__main__':main()
