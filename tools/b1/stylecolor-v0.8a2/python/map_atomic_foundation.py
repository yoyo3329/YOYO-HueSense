#!/usr/bin/env python3
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--a1-run',required=True);ap.add_argument('--a2-run',required=True);a=ap.parse_args();a1=Path(a.a1_run);a2=Path(a.a2_run)
 obs=json.loads((a1/'atomic_region_observations.json').read_text());fw=json.loads((a2/'foundation_worker_summary.json').read_text());fby={x['image_id']:x for x in fw['results'] if 'error' not in x};outs=[];withp=0;without=0
 for img in obs['images']:
  f=fby.get(img['image_id']);
  if not f:continue
  ah,aw=img['analysis_size'][1],img['analysis_size'][0]; fm=[]
  for g in f['groups']:
   m=np.array(Image.open(a2/g['mask_asset']).convert('L').resize((aw,ah),Image.Resampling.NEAREST))>0;fm.append((g['group_id'],m))
  atom=[];gm={gid:[] for gid,_ in fm}
  for r in img['atomic_regions']:
   am=np.array(Image.open(a1/r['mask_asset']).convert('L'))>0;aa=am.sum();e=[]
   for gid,m in fm:
    inter=int((am&m).sum())
    if inter<=0:continue
    union=int((am|m).sum());e.append({'group_id':gid,'intersection_pixels':inter,'atomic_coverage':inter/max(1,aa),'iou':inter/max(1,union)})
   e.sort(key=lambda x:(-x['atomic_coverage'],-x['iou'],x['group_id']));primary=e[0]['group_id'] if e else None
   if primary:withp+=1
   else:without+=1
   atom.append({'region_id':r['region_id'],'primary_group_id':primary,'overlaps':e})
   for x in e:gm[x['group_id']].append({'region_id':r['region_id'],'atomic_coverage':x['atomic_coverage'],'iou':x['iou'],'is_primary':primary==x['group_id']})
  outs.append({'image_id':img['image_id'],'atomic_regions':atom,'groups':[{'group_id':k,'atomic_memberships':v} for k,v in gm.items()]})
 out={'schema_version':'0.8a2.0','primary_membership_rule':'ARGMAX_ATOMIC_COVERAGE_NO_THRESHOLD','images':outs,'summary':{'atomic_with_primary':withp,'atomic_without_primary':without}}
 (a2/'atomic_foundation_overlap_raw.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(out['summary']))
if __name__=='__main__':main()
