#!/usr/bin/env python3
import argparse,json,math,statistics,hashlib,shutil
from pathlib import Path
import numpy as np
from PIL import Image

def read(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,o): Path(p).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def q(vals,p):
    if not vals:return None
    return float(np.quantile(np.asarray(vals,float),p))
def stats(vals):
    vals=[float(x) for x in vals if x is not None and math.isfinite(float(x))]
    if not vals:return {'n':0,'min':None,'p05':None,'p25':None,'median':None,'p75':None,'p95':None,'max':None,'mean':None,'std':None,'positive_ratio':None,'negative_ratio':None,'zero_ratio':None}
    a=np.asarray(vals,float)
    return {'n':len(vals),'min':float(a.min()),'p05':q(vals,.05),'p25':q(vals,.25),'median':q(vals,.5),'p75':q(vals,.75),'p95':q(vals,.95),'max':float(a.max()),'mean':float(a.mean()),'std':float(a.std()),'positive_ratio':float(np.mean(a>0)),'negative_ratio':float(np.mean(a<0)),'zero_ratio':float(np.mean(a==0))}
def amb(m,cfg):
    if m is None:return 'UNAVAILABLE'
    b=cfg
    if m < b['very_high']: return 'VERY_HIGH_AMBIGUITY'
    if m < b['high']: return 'HIGH_AMBIGUITY'
    if m < b['moderate']: return 'MODERATE_AMBIGUITY'
    return 'LOWER_AMBIGUITY'
def mask_arr(p): return np.asarray(Image.open(p).convert('L'))>0
def border_metrics(m):
    if m.size==0:return {'touch_sides':0,'border_coverage_fraction':0.0}
    sides=[bool(m[0,:].any()),bool(m[-1,:].any()),bool(m[:,0].any()),bool(m[:,-1].any())]
    border=np.concatenate([m[0,:],m[-1,:],m[:,0],m[:,-1]])
    return {'touch_sides':sum(sides),'border_coverage_fraction':float(np.mean(border))}
def flatten_scores(axis):
    scores=(axis or {}).get('scores',{})
    vals=sorted([(float(v),k) for k,v in scores.items()],reverse=True)
    if not vals:return {'top1_label':None,'top1_score':None,'top2_label':None,'top2_score':None,'margin':None,'spread':None,'std':None}
    top1=vals[0];top2=vals[1] if len(vals)>1 else (None,None)
    arr=np.asarray([v for v,_ in vals],float)
    return {'top1_label':top1[1],'top1_score':top1[0],'top2_label':top2[1],'top2_score':top2[0],'margin':None if top2[0] is None else top1[0]-top2[0],'spread':float(arr.max()-arr.min()),'std':float(arr.std())}
def recovery_dist(details):
    return {k:stats([d.get(k) for d in details]) for k in ['homogeneity_gain','bimodal_reduction','lightness_spread_reduction']}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--a21-run',required=True);ap.add_argument('--out-dir',required=True);ap.add_argument('--config',required=True);ap.add_argument('--env-audit');a=ap.parse_args()
    up=Path(a.a21_run);out=Path(a.out_dir);out.mkdir(parents=True,exist_ok=True);cfg=read(a.config)
    fh=read(up/'foundation_mask_hypotheses.json');mp=read(up/'atomic_foundation_overlap_raw.json');rec=read(up/'a1_failure_recovery.json');graph=read(up/'a2_relationship_multigraph.json');manifest=read(up/'run_manifest.json')
    config=cfg['mask_role_policy'];semBands=cfg['semantic_ambiguity_bands'];embBands=cfg['embedding_ambiguity_bands']
    graph_by={x['image_id']:x for x in graph['images']}; map_by={x['image_id']:x for x in mp['images']}; rec_by={x['image_id']:x for x in rec['cases']}
    out_images=[];mask_role_index={};all_role_counts={};global_count=0;umbrella_count=0
    for img in fh['images']:
        iid=img['image_id']; edges=graph_by.get(iid,{}).get('edges',[]); parents={};children={}
        embmeta={}
        for e in edges:
            if e.get('edge_type')=='MASK_CONTAINMENT':
                c=e['child_mask_id'];p=e['parent_mask_id'];parents.setdefault(c,[]).append(p);children.setdefault(p,[]).append(c)
            if e.get('edge_type')=='VISUAL_EMBEDDING_NEIGHBOR':
                s,t=e['source_mask_id'],e['target_mask_id']
                embmeta[s]={'absolute_cosine':e.get('absolute_visual_embedding_cosine'),'neighbor_margin':e.get('source_neighbor_margin'),'peer':t}
                embmeta[t]={'absolute_cosine':e.get('absolute_visual_embedding_cosine'),'neighbor_margin':e.get('target_neighbor_margin'),'peer':s}
        masks=img['foundation_mask_hypotheses'];arrs=[]
        for m in masks: arrs.append(mask_arr(up/m['mask_asset']))
        coverage=np.zeros_like(arrs[0],dtype=np.uint16) if arrs else None
        if arrs:
            for mm in arrs: coverage += mm.astype(np.uint16)
        roles=[]
        for idx,(m,mm) in enumerate(zip(masks,arrs)):
            mid=m['mask_hypothesis_id'];area=float(m.get('area_ratio',float(mm.mean())));bm=border_metrics(mm);child_count=len(children.get(mid,[]));parent_count=len(parents.get(mid,[]))
            unique=float(np.mean(coverage[mm]==1)) if mm.any() else 0.0
            global_signal=area>=config['global_area_signal']
            umbrella_signal=(area>=config['large_container_area_signal'] and child_count>=config['umbrella_min_child_count'] and bm['touch_sides']>=config['umbrella_min_border_sides'])
            role_h=[]
            if global_signal or umbrella_signal: role_h.append({'role':'GLOBAL_CONTEXT_CANDIDATE','evidence':['AREA_GLOBAL_SIGNAL'] if global_signal else ['LARGE_CONTAINER','MANY_CHILDREN','BORDER_TOUCH']})
            if area>=config['large_container_area_signal'] and bm['touch_sides']>=2: role_h.append({'role':'BACKGROUND_PLANE_CANDIDATE','evidence':['LARGE_AREA','BORDER_CONNECTED']})
            if parent_count>0 and area<config['large_container_area_signal']: role_h.append({'role':'NESTED_COMPONENT_CANDIDATE','evidence':['HAS_CONTAINMENT_PARENT']})
            if area<config['large_container_area_signal'] and unique>=config['local_unique_coverage_reference']: role_h.append({'role':'LOCAL_COMPONENT_CANDIDATE','evidence':['NON_GLOBAL_AREA','UNIQUE_COVERAGE_PRESENT']})
            if not role_h: role_h.append({'role':'AMBIGUOUS','evidence':['NO_STRONG_ROLE_SIGNAL']})
            if len({x['role'] for x in role_h})>1: role_h.append({'role':'AMBIGUOUS','evidence':['MULTIPLE_ROLE_HYPOTHESES']})
            sem={}
            for axis_name,axis in m.get('semantic_prior',{}).get('axes',{}).items():
                z=flatten_scores(axis); z['ambiguity_state']=amb(z['margin'],semBands); sem[axis_name]=z
            em=embmeta.get(mid,{});emarg=em.get('neighbor_margin');emout={**em,'ambiguity_state':amb(emarg,embBands),'authority':'AUXILIARY_ONLY'}
            stab=None
            cs=img.get('critical_case_mask_stability')
            if cs:
                stab={}
                for pn,sv in cs.items():
                    vals=sv.get('best_iou_per_base_mask',[]); stab[pn]=vals[idx] if idx<len(vals) else None
            route_block=bool(global_signal or umbrella_signal)
            if route_block: global_count+=1
            if umbrella_signal: umbrella_count+=1
            r={'mask_hypothesis_id':mid,'area_ratio':area,'border':bm,'child_count':child_count,'parent_count':parent_count,'unique_coverage_ratio':unique,'role_hypotheses':role_h,'role_semantics':'HYPOTHESIS_ONLY_NOT_TRUTH','local_recovery_route_allowed':not route_block,'local_recovery_exclusion_reason':'GLOBAL_OR_UMBRELLA_CONTEXT_MASK' if route_block else None,'semantic_ambiguity':sem,'embedding_ambiguity':emout,'critical_case_stability':stab,'proposal_information_vector':{'area_ratio':area,'unique_coverage_ratio':unique,'component_contrast':m.get('metrics',{}).get('component_contrast'),'color_homogeneity_score':m.get('metrics',{}).get('color_homogeneity_score'),'semantic_axis_margins':{k:v.get('margin') for k,v in sem.items()},'embedding_neighbor_margin':emarg,'stability':stab},'final_information_score':None,'authority':'EVIDENCE_ONLY'}
            roles.append(r);mask_role_index[mid]=r
            for rr in role_h: all_role_counts[rr['role']]=all_role_counts.get(rr['role'],0)+1
        # coverage with / without global-role masks
        union_all=np.zeros_like(arrs[0],bool) if arrs else np.zeros((1,1),bool);union_local=union_all.copy()
        for m,mm in zip(masks,arrs):
            union_all|=mm
            if mask_role_index[m['mask_hypothesis_id']]['local_recovery_route_allowed']: union_local|=mm
        mapping=map_by.get(iid,{'atomic_regions':[],'foundation_masks':[]})
        raw_split=sum(1 for r in mapping['atomic_regions'] if len(r.get('overlaps',[]))>1)
        local_split=0
        for r in mapping['atomic_regions']:
            loc=[x for x in r.get('overlaps',[]) if mask_role_index.get(x['mask_hypothesis_id'],{}).get('local_recovery_route_allowed')]
            if len(loc)>1: local_split+=1
        raw_group=sum(1 for g in mapping['foundation_masks'] if len(g.get('atomic_memberships',[]))>1)
        local_group=sum(1 for g in mapping['foundation_masks'] if mask_role_index.get(g['mask_hypothesis_id'],{}).get('local_recovery_route_allowed') and len(g.get('atomic_memberships',[]))>1)
        imout={'image_id':iid,'mask_count':len(masks),'roles':roles,'global_mask_dominance':{'largest_mask_area_ratio':max([r['area_ratio'] for r in roles],default=0),'global_mask_count':sum(r['area_ratio']>=config['global_area_signal'] for r in roles),'large_container_count':sum(r['area_ratio']>=config['large_container_area_signal'] for r in roles),'umbrella_warning_count':sum(not r['local_recovery_route_allowed'] for r in roles),'children_inside_global_mask':sum(r['child_count'] for r in roles if not r['local_recovery_route_allowed']),'union_coverage_with_global':float(union_all.mean()),'union_coverage_without_global':float(union_local.mean()),'coverage_delta_from_global':float(union_all.mean()-union_local.mean())},'hypothesis_capability':{'raw_foundation':{'split_capable_atomic_count':raw_split,'group_capable_mask_count':raw_group},'local_component_only':{'split_capable_atomic_count':local_split,'group_capable_mask_count':local_group},'semantics':'CAPABILITY_COUNTS_NOT_RECOVERY_SUCCESS'}}
        # stability tails for critical cases
        cs=img.get('critical_case_mask_stability')
        if cs:
            st={}
            for pn,sv in cs.items():
                vals=sv.get('best_iou_per_base_mask',[]);ss=stats(vals);ss['below_0_90']=sum(v<.90 for v in vals);ss['below_0_80']=sum(v<.80 for v in vals);ss['below_0_50']=sum(v<.50 for v in vals)
                worst=sorted([(v,i) for i,v in enumerate(vals)])[:5];ss['worst_masks']=[{'mask_hypothesis_id':masks[i]['mask_hypothesis_id'] if i<len(masks) else None,'best_iou':float(v),'area_ratio':masks[i]['area_ratio'] if i<len(masks) else None} for v,i in worst]
                st[pn]=ss
            imout['stability_tail_audit']=st
        out_images.append(imout)
    # Recovery distributions for known A1 failures: raw vs local-role only
    rec_cases=[]
    for c in rec['cases']:
        iid=c['image_id']; rows=[]
        all_raw=[];all_local=[]
        for rr in c.get('foreground_dilution_recovery_evidence',[]):
            raw=rr.get('details',[]);local=[d for d in raw if mask_role_index.get(d['mask_hypothesis_id'],{}).get('local_recovery_route_allowed')]
            all_raw.extend(raw);all_local.extend(local)
            rows.append({'region_id':rr['region_id'],'raw_foundation':{'candidate_count':len(raw),'distributions':recovery_dist(raw)},'local_component_only':{'candidate_count':len(local),'distributions':recovery_dist(local)}})
        image_qc=next((x for x in out_images if x['image_id']==iid),None)
        rec_cases.append({'case_name':c['case_name'],'image_id':iid,'a1_failure_modes':c.get('a1_failure_modes',[]),'coverage':image_qc['global_mask_dominance'] if image_qc else None,'capability_counts':image_qc['hypothesis_capability'] if image_qc else None,'foreground_dilution_recovery':{'per_atomic_region':rows,'raw_foundation_aggregate':{'candidate_count':len(all_raw),'distributions':recovery_dist(all_raw)},'local_component_aggregate':{'candidate_count':len(all_local),'distributions':recovery_dist(all_local)}},'interpretation':'RECOVERY_DISTRIBUTIONS_NOT_ACCURACY_CLAIM'})
    # Environment audit copied in, and semantic/embedding evidence authority adjusted if warnings exist.
    env=read(a.env_audit) if a.env_audit and Path(a.env_audit).exists() else {'warnings':['ENV_AUDIT_MISSING']}
    warn=env.get('warnings',[]);evidence_env='CLEAN' if not warn else 'UPSTREAM_ENVIRONMENT_WARNING_QUARANTINED_AS_AUXILIARY'
    qc={'schema_version':'0.8a2.2','name':'Perceptual Hypothesis Quality Control','upstream_a21_run':str(up),'upstream_a21_manifest_sha256':hashlib.sha256((up/'run_manifest.json').read_bytes()).hexdigest(),'authority':'NONE','masks_deleted':0,'style_graph_built':False,'production_authority':'NONE','mask_role_semantics':'HEURISTIC_ROLE_ROUTING_NOT_TRUTH','global_masks_preserved_but_blocked_from_local_recovery':True,'semantic_embedding_evidence_environment_status':evidence_env,'role_counts':all_role_counts,'global_or_umbrella_routed_mask_count':global_count,'umbrella_signal_count':umbrella_count,'images':out_images,'critical_case_recovery':rec_cases,'environment_audit':env}
    write(out/'hypothesis_quality_control.json',qc)
    write(out/'mask_role_hypotheses.json',{'schema_version':'0.8a2.2','authority':'HYPOTHESIS_ONLY','masks_are_deleted':False,'images':[{'image_id':x['image_id'],'roles':x['roles']} for x in out_images]})
    write(out/'recovery_distribution_audit.json',{'schema_version':'0.8a2.2','role':'RAW_VS_LOCAL_COMPONENT_RECOVERY_DISTRIBUTIONS','cases':rec_cases})
    write(out/'global_mask_dominance_audit.json',{'schema_version':'0.8a2.2','role':'GLOBAL_CONTEXT_SEPARATION_NOT_DELETION','images':[{'image_id':x['image_id'],**x['global_mask_dominance']} for x in out_images]})
    write(out/'stability_tail_audit.json',{'schema_version':'0.8a2.2','images':[{'image_id':x['image_id'],'stability_tail_audit':x.get('stability_tail_audit')} for x in out_images if x.get('stability_tail_audit')]})
    write(out/'environment_integrity.json',env)
    print(json.dumps({'images':len(out_images),'masks':sum(x['mask_count'] for x in out_images),'global_or_umbrella':global_count,'critical_cases':len(rec_cases)}))
if __name__=='__main__':main()
