#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,math,statistics
from pathlib import Path
import numpy as np
from PIL import Image

def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,x): Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def dist(vals):
 vals=[float(x) for x in vals if x is not None and math.isfinite(float(x))]
 if not vals:return {'n':0}
 a=np.asarray(vals,float)
 return {'n':len(vals),'min':float(a.min()),'p05':float(np.percentile(a,5)),'p25':float(np.percentile(a,25)),'median':float(np.median(a)),'p75':float(np.percentile(a,75)),'p95':float(np.percentile(a,95)),'max':float(a.max()),'mean':float(a.mean()),'std':float(a.std())}
POPCOUNT=np.array([bin(i).count("1") for i in range(256)],dtype=np.uint8)
def mask(run,asset,max_side=256):
 im=Image.open(Path(run)/asset).convert('L')
 if max(im.size)>max_side:
  scale=max_side/max(im.size);im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.Resampling.NEAREST)
 a=np.asarray(im)>0
 return np.packbits(a.reshape(-1)),int(a.sum()),a.shape
def iou(a,b):
 pa,aa,sa=a;pb,ab,sb=b
 if sa!=sb:
  raise ValueError(f'MASK_SHAPE_MISMATCH {sa} {sb}')
 inter=int(POPCOUNT[np.bitwise_and(pa,pb)].sum());uni=aa+ab-inter
 return float(inter/uni) if uni else 1.0
def cosine(a,b):
 a=np.asarray(a,float);b=np.asarray(b,float);d=np.linalg.norm(a)*np.linalg.norm(b);return float(a@b/d) if d else None
def flatten_sem(m):
 out=[]
 for axis in ['content_type','visual_form','material_appearance']:
  sc=((m.get('semantic_prior') or {}).get('axes') or {}).get(axis,{}).get('scores') or {}
  for k in sorted(sc):out.append(float(sc[k]))
 return np.asarray(out,float)
def style(m): return (m.get('semantic_prior') or {}).get('style_similarity')
def by_image(doc): return {x['image_id']:x for x in doc['images']}
def edge_set(run, mapping=None):
 g=read(Path(run)/'a2_relationship_multigraph.json');out={}
 for im in g['images']:
  s=set();meta={}
  for e in im['edges']:
   if e.get('edge_type')!='VISUAL_EMBEDDING_NEIGHBOR':continue
   a=e['source_mask_id'];b=e['target_mask_id']
   if mapping:
    a=mapping.get(a);b=mapping.get(b)
    if not a or not b: continue
   key=tuple(sorted([a,b]));s.add(key);meta[key]=e
  out[im['image_id']]={'set':s,'meta':meta}
 return out

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--old-run',required=True);ap.add_argument('--new-run',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
 old,new=Path(a.old_run),Path(a.new_run);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
 od=by_image(read(old/'foundation_mask_hypotheses.json'));nd=by_image(read(new/'foundation_mask_hypotheses.json'))
 imgs=[];all_old_best=[];all_new_best=[];all_mut_iou=[];emb_cos=[];emb_cos_hi=[];sem_l1=[];sem_max=[];style_delta=[];map_old_to_new={};map_new_to_old={};critical={}
 for iid in sorted(set(od)&set(nd)):
  O=od[iid]['foundation_mask_hypotheses'];N=nd[iid]['foundation_mask_hypotheses'];om=[mask(old,x['mask_asset']) for x in O];nm=[mask(new,x['mask_asset']) for x in N]
  M=np.zeros((len(O),len(N)),float)
  for i,x in enumerate(om):
   for j,y in enumerate(nm): M[i,j]=iou(x,y)
  ob=M.max(axis=1).tolist() if len(N) else [0]*len(O);nb=M.max(axis=0).tolist() if len(O) else [0]*len(N);all_old_best+=ob;all_new_best+=nb
  pairs=[]
  if len(O) and len(N):
   oi=M.argmax(axis=1);nj=M.argmax(axis=0)
   for i,j in enumerate(oi):
    if nj[j]==i:
     v=float(M[i,j]);pairs.append((i,int(j),v));all_mut_iou.append(v)
     oid=O[i]['mask_hypothesis_id'];nid=N[j]['mask_hypothesis_id'];map_old_to_new[oid]=nid;map_new_to_old[nid]=oid
     c=cosine(O[i].get('visual_embedding',[]),N[j].get('visual_embedding',[]));
     if c is not None: emb_cos.append(c);emb_cos_hi.extend([c] if v>=.9 else [])
     so,sn=flatten_sem(O[i]),flatten_sem(N[j])
     if len(so)==len(sn) and len(so):
      d=np.abs(so-sn);sem_l1.append(float(d.mean()));sem_max.append(float(d.max()))
     s0,s1=style(O[i]),style(N[j]);
     if s0 is not None and s1 is not None: style_delta.append(abs(float(s0)-float(s1)))
  imgs.append({'image_id':iid,'old_masks':len(O),'new_masks':len(N),'mask_count_delta':len(N)-len(O),'old_to_new_best_iou':dist(ob),'new_to_old_best_iou':dist(nb),'mutual_best_pairs':len(pairs),'mutual_best_iou':dist([x[2] for x in pairs]),'near_identical_mutual_pairs_iou_ge_0_9':sum(x[2]>=.9 for x in pairs),'old_containment':len(od[iid].get('mask_containment_relations',[])),'new_containment':len(nd[iid].get('mask_containment_relations',[]))})
  if od[iid].get('critical_case_mask_stability') or nd[iid].get('critical_case_mask_stability'):
   critical[iid]={'old':od[iid].get('critical_case_mask_stability'),'new':nd[iid].get('critical_case_mask_stability')}
 old_edges=edge_set(old,mapping=map_old_to_new);new_edges=edge_set(new)
 retained=0;old_total=0;new_total=0;per_graph=[];margin_delta=[]
 for iid in sorted(set(old_edges)&set(new_edges)):
  os=old_edges[iid]['set'];ns=new_edges[iid]['set'];old_total+=len(os);new_total+=len(ns);r=os&ns;retained+=len(r)
  for k in r:
   oe=old_edges[iid]['meta'].get(k)
   ne=new_edges[iid]['meta'].get(k)
   if oe and ne:
    for q in ['source_neighbor_margin','target_neighbor_margin']:
     if oe.get(q) is not None and ne.get(q) is not None:margin_delta.append(abs(float(oe[q])-float(ne[q])))
  per_graph.append({'image_id':iid,'old_mapped_edges':len(os),'new_edges':len(ns),'retained_edges':len(r),'retention_ratio_of_mappable_old':(len(r)/len(os) if os else None)})
 report={'schema_version':'0.8a2.1-clean-repro-drift','old_uncertified_run':str(old),'new_certified_run':str(new),
  'interpretation_guard':{'mask_matching_resolution':'Masks are nearest-neighbor resized to max side 256 and bit-packed for efficient IoU drift matching; this is a drift diagnostic, not pixel-accuracy validation.','sam_geometry_drift':'primarily environment/runtime reproducibility because SAM model/revision/preprocessing are held fixed','openclip_drift':'includes clean environment plus explicit QuickGELU architecture-consistency correction; do not attribute solely to environment','automatic_evidence_validation_claim':False},
  'sam_geometry':{'old_mask_total':sum(x['old_masks'] for x in imgs),'new_mask_total':sum(x['new_masks'] for x in imgs),'mask_count_delta':sum(x['mask_count_delta'] for x in imgs),'old_mask_best_new_iou':dist(all_old_best),'new_mask_best_old_iou':dist(all_new_best),'mutual_best_iou':dist(all_mut_iou),'mutual_best_pairs':len(all_mut_iou),'mutual_pairs_iou_ge_0_9':sum(x>=.9 for x in all_mut_iou),'per_image':imgs},
  'openclip_drift_on_mutual_geometry_pairs':{'embedding_cosine_all_mutual':dist(emb_cos),'embedding_cosine_iou_ge_0_9':dist(emb_cos_hi),'semantic_score_mean_abs_delta':dist(sem_l1),'semantic_score_max_abs_delta':dist(sem_max),'style_similarity_abs_delta':dist(style_delta)},
  'graph_drift':{'old_mappable_visual_edges':old_total,'new_visual_edges':new_total,'retained_edges':retained,'retention_ratio_of_mappable_old':(retained/old_total if old_total else None),'neighbor_margin_abs_delta_retained':dist(margin_delta),'per_image':per_graph},
  'critical_case_stability':critical,
  'review_matrix':{
    'A_NEAR_IDENTICAL':'SAM geometry near-identical; OpenCLIP embeddings/semantic scores also near-identical. Prior warning was mainly certification/provenance debt.',
    'B_SAM_STABLE_EMBEDDING_DRIFT':'SAM geometry stable but OpenCLIP evidence materially shifts. Rebuild embedding/semantic evidence from certified run.',
    'C_SAM_GEOMETRY_DRIFT':'SAM geometry materially shifts. Treat prior A2.1 Foundation evidence as uncertified baseline only and rerun downstream QC from certified run.',
    'decision':'MANUAL_REVIEW_REQUIRED_NO_AUTOMATIC_THRESHOLD_CLASSIFICATION'
  }}
 write(out/'drift_comparison.json',report)
 # compact HTML
 def e(s): return str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
 html=f'''<!doctype html><meta charset="utf-8"><title>YOYO Clean Repro Drift</title><style>body{{font-family:system-ui;margin:24px;max-width:1400px}}pre{{white-space:pre-wrap;background:#f4f4f4;padding:14px;border-radius:10px}}table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:6px;text-align:left}}.warn{{border-left:4px solid #555;padding:10px}}</style><h1>YOYO v0.8-A.2.1 Clean Certified Reproduction — Drift Comparison</h1><p class="warn"><b>No automatic evidence-validation claim.</b> SAM drift and OpenCLIP drift have different interpretation scopes because QuickGELU is explicitly corrected in the certified reproduction.</p><h2>Headline</h2><pre>{e(json.dumps({'sam_geometry':report['sam_geometry']|{'per_image':'[see table]'},'openclip':report['openclip_drift_on_mutual_geometry_pairs'],'graph':report['graph_drift']|{'per_image':'[see JSON]'}},indent=2))}</pre><h2>Per image SAM drift</h2><table><tr><th>Image</th><th>Old</th><th>New</th><th>Δ</th><th>Old→new best IoU median</th><th>Mutual pairs</th><th>Mutual IoU median</th></tr>{''.join(f"<tr><td>{x['image_id']}</td><td>{x['old_masks']}</td><td>{x['new_masks']}</td><td>{x['mask_count_delta']}</td><td>{x['old_to_new_best_iou'].get('median')}</td><td>{x['mutual_best_pairs']}</td><td>{x['mutual_best_iou'].get('median')}</td></tr>" for x in imgs)}</table><h2>Review matrix</h2><pre>{e(json.dumps(report['review_matrix'],indent=2))}</pre>'''
 (out/'drift_report.html').write_text(html,encoding='utf-8')
 print('DRIFT_COMPARISON_READY')
 print('SAM_OLD_MASKS',report['sam_geometry']['old_mask_total'],'SAM_NEW_MASKS',report['sam_geometry']['new_mask_total'])
 print('MUTUAL_IOU_MEDIAN',report['sam_geometry']['mutual_best_iou'].get('median'))
 print('EMBEDDING_COSINE_HIGH_GEOMETRY_MEDIAN',report['openclip_drift_on_mutual_geometry_pairs']['embedding_cosine_iou_ge_0_9'].get('median'))
if __name__=='__main__':main()
