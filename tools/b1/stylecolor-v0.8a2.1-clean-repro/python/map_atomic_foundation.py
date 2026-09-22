#!/usr/bin/env python3
import argparse,json,math
from pathlib import Path
import numpy as np
from PIL import Image

def entropy_norm(vals):
    vals=np.asarray(vals,float);s=vals.sum()
    if s<=0 or len(vals)<=1:return 0.0
    p=vals/s;h=-float(np.sum(p*np.log(np.clip(p,1e-12,None))))
    return h/math.log(len(vals))

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--a1-run',required=True);ap.add_argument('--a2-run',required=True);a=ap.parse_args();a1=Path(a.a1_run);a2=Path(a.a2_run)
    obs=json.loads((a1/'atomic_region_observations.json').read_text(encoding='utf-8'));fw=json.loads((a2/'foundation_worker_summary.json').read_text(encoding='utf-8'));fby={x['image_id']:x for x in fw['results'] if 'error' not in x};outs=[];atom_with=0;atom_without=0;split_capable=0;group_capable=0
    for img in obs['images']:
        f=fby.get(img['image_id'])
        if not f:continue
        ah,aw=img['analysis_size'][1],img['analysis_size'][0];fm=[]
        for g in f['foundation_mask_hypotheses']:
            m=np.array(Image.open(a2/g['mask_asset']).convert('L').resize((aw,ah),Image.Resampling.NEAREST))>0;fm.append((g['mask_hypothesis_id'],m))
        atom=[];gm={gid:[] for gid,_ in fm}
        for r in img['atomic_regions']:
            am=np.array(Image.open(a1/r['mask_asset']).convert('L'))>0;aa=int(am.sum());e=[]
            for gid,m in fm:
                inter=int((am&m).sum())
                if inter<=0:continue
                union=int((am|m).sum());e.append({'mask_hypothesis_id':gid,'intersection_pixels':inter,'atomic_coverage':inter/max(1,aa),'iou':inter/max(1,union)})
            e.sort(key=lambda x:(-x['atomic_coverage'],-x['iou'],x['mask_hypothesis_id']))
            if e:atom_with+=1
            else:atom_without+=1
            vals=[x['atomic_coverage'] for x in e];top1=vals[0] if vals else None;top2=vals[1] if len(vals)>1 else None;margin=(top1-top2) if top2 is not None else None;ent=entropy_norm(vals)
            actions=['KEEP','UNKNOWN']+(['SPLIT'] if len(e)>1 else [])
            if 'SPLIT' in actions:split_capable+=1
            atom.append({'region_id':r['region_id'],'overlaps':e,'coverage_rank_metrics':{'top1_coverage':top1,'top2_coverage':top2,'top1_top2_margin':margin,'normalized_overlap_entropy':ent,'overlap_count':len(e)},'candidate_actions':actions,'resolution_state':'UNKNOWN','forced_primary_group':False})
            for x in e:gm[x['mask_hypothesis_id']].append({'region_id':r['region_id'],'atomic_coverage':x['atomic_coverage'],'iou':x['iou']})
        masks=[]
        for gid,members in gm.items():
            members=sorted(members,key=lambda x:(-x['atomic_coverage'],-x['iou'],x['region_id']))
            actions=['KEEP','UNKNOWN']+(['GROUP'] if len(members)>1 else [])
            if 'GROUP' in actions:group_capable+=1
            masks.append({'mask_hypothesis_id':gid,'atomic_memberships':members,'candidate_actions':actions,'resolution_state':'UNKNOWN','foundation_mask_equals_perceptual_component':False})
        outs.append({'image_id':img['image_id'],'atomic_regions':atom,'foundation_masks':masks})
    out={'schema_version':'0.8a2.1-clean-repro','forced_primary_ownership':False,'resolution_default':'UNKNOWN','images':outs,'summary':{'atomic_with_foundation_overlap':atom_with,'atomic_without_foundation_overlap':atom_without,'atomic_split_hypothesis_capable':split_capable,'mask_group_hypothesis_capable':group_capable}}
    (a2/'atomic_foundation_overlap_raw.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(out['summary']))
if __name__=='__main__':main()
