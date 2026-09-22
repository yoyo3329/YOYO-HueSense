#!/usr/bin/env python3
from __future__ import annotations
import os,sys,json,math,hashlib,argparse
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageEnhance

VERSION='0.8a2.1-clean-repro'

def sha256_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
    return h.hexdigest()

def srgb_to_linear(x):
    x=x.astype(np.float64);return np.where(x<=.04045,x/12.92,((x+.055)/1.055)**2.4)
def linear_srgb_to_oklab(rgb):
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
    l=.4122214708*r+.5363325363*g+.0514459929*b;m=.2119034982*r+.6806995451*g+.1073969566*b;s=.0883024619*r+.2817188376*g+.6299787005*b
    l_,m_,s_=np.cbrt(l),np.cbrt(m),np.cbrt(s)
    L=.2104542553*l_+.7936177850*m_-.0040720468*s_;A=1.9779984951*l_-2.4285922050*m_+.4505937099*s_;B=.0259040371*l_+.7827717662*m_-.8086757660*s_
    return np.stack([L,A,B],axis=-1)
def rgb01_to_oklab(x):return linear_srgb_to_oklab(srgb_to_linear(x))
def oklab_to_linear_srgb(lab):
    L,A,B=lab[...,0],lab[...,1],lab[...,2];l_=L+.3963377774*A+.2158037573*B;m_=L-.1055613458*A-.0638541728*B;s_=L-.0894841775*A-1.2914855480*B;l,m,s=l_**3,m_**3,s_**3
    return np.stack([4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s],axis=-1)
def linear_to_srgb(x):x=np.clip(x,0,1);return np.where(x<=.0031308,12.92*x,1.055*np.power(x,1/2.4)-.055)
def lab_to_hex(l):
    rgb=linear_to_srgb(oklab_to_linear_srgb(np.asarray(l).reshape(1,1,3)))[0,0];v=np.clip(np.rint(rgb*255),0,255).astype(int);return '#%02X%02X%02X'%tuple(v.tolist())

def deterministic_kmeans(points,k=2,max_iter=12):
    if len(points)==0:return np.zeros((0,3)),np.zeros((0,),int)
    k=max(1,min(k,len(points)));med=np.median(points[:,0]);cent=[points[int(np.argmin(np.abs(points[:,0]-med)))]]
    while len(cent)<k:
        d=np.min(np.stack([np.sum((points-c)**2,axis=1) for c in cent]),axis=0);cent.append(points[int(np.argmax(d))])
    cent=np.stack(cent).astype(float);labels=np.zeros(len(points),int)
    for it in range(max_iter):
        d=np.stack([np.sum((points-c)**2,axis=1) for c in cent],axis=1);new=np.argmin(d,axis=1)
        if it and np.array_equal(new,labels):break
        labels=new
        for j in range(k):
            s=points[labels==j]
            if len(s):cent[j]=s.mean(axis=0)
    return cent,labels

def mask_metrics(arr,mask):
    pix=rgb01_to_oklab(arr[mask])
    if len(pix)==0:return None
    mean=pix.mean(axis=0);var=float(np.mean(np.sum((pix-mean)**2,axis=1)));homog=float(math.exp(-var/.006));L=pix[:,0];spread=float(np.percentile(L,90)-np.percentile(L,10))
    sample=pix[::max(1,len(pix)//2200)];centers,labels=deterministic_kmeans(sample,2);pal=[]
    for j,c in enumerate(centers):pal.append({'hex':lab_to_hex(c),'ratio_within_mask':float(np.mean(labels==j)),'lab':[float(x) for x in c]})
    pal.sort(key=lambda x:x['ratio_within_mask'],reverse=True);contrast=0.;bimodal=0.
    if len(pal)>1:
        c1=np.array(pal[0]['lab']);c2=np.array(pal[1]['lab']);contrast=float(np.linalg.norm(c1-c2));bal=1-abs(pal[0]['ratio_within_mask']-pal[1]['ratio_within_mask']);bimodal=float(np.clip(contrast/.22*bal,0,1))
    return {'mean_lab':[float(x) for x in mean],'color_homogeneity_score':homog,'lightness_spread_p10_p90':spread,'bimodal_color_score':bimodal,'palette':pal,'component_contrast':contrast}

def bbox_from_mask(m):
    ys,xs=np.where(m)
    return [0,0,0,0] if not len(xs) else [int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
def mask_crop(im,mask,bbox,bg=119):
    a=np.asarray(im).copy();x0,y0,x1,y1=bbox;sub=a[y0:y1,x0:x1];sm=mask[y0:y1,x0:x1];out=np.full_like(sub,bg);out[sm]=sub[sm];return Image.fromarray(out)
def normalize_rows(x):return x/np.clip(np.linalg.norm(x,axis=1,keepdims=True),1e-12,None)

def generate_mock_masks(im):
    arr=np.asarray(im.convert('RGB'));h,w=arr.shape[:2]
    # Geometry-driven deterministic masks to exercise split/group topology.
    masks=[]
    left=np.zeros((h,w),bool);left[:,0:w//2]=1
    right=np.zeros((h,w),bool);right[:,w//2:w]=1
    center=np.zeros((h,w),bool);center[h//4:3*h//4,w//4:3*w//4]=1
    fullish=np.zeros((h,w),bool);fullish[2:h-2,2:w-2]=1
    for m,s in [(left,.81),(right,.80),(center,.79),(fullish,.55)]:masks.append((m,s))
    return masks

def real_models(cfg,model_lock):
    import torch,open_clip
    from transformers import pipeline
    torch.set_grad_enabled(False);torch.set_num_threads(max(1,min(8,(os.cpu_count() or 4)-1)))
    snap=model_lock['snapshot_path']
    print('Loading pinned SAM2 snapshot '+model_lock['resolved_revision'],flush=True)
    sam=pipeline('mask-generation',model=snap,device=-1)
    print('Loading OpenCLIP visual model...',flush=True)
    clip,_,preprocess=open_clip.create_model_and_transforms(cfg['visual_embedding']['model'],pretrained=cfg['visual_embedding']['pretrained'],device='cpu');clip.eval();tok=open_clip.get_tokenizer(cfg['visual_embedding']['model'])
    flat=[];index=[]
    for axis,prompts in cfg['semantic_prior']['axes'].items():
        for label,text in prompts.items():flat.append(text);index.append((axis,label))
    flat.append(cfg['concept']);index.append(('style','concept'))
    with torch.inference_mode():tf=clip.encode_text(tok(flat)).cpu().numpy().astype(np.float32)
    tf=normalize_rows(tf)
    # deterministic model parameter digest for reproducibility record
    hh=hashlib.sha256()
    for name,t in sorted(clip.state_dict().items()):
        hh.update(name.encode());hh.update(t.detach().cpu().numpy().tobytes())
    clip_hash=hh.hexdigest()
    expected=cfg.get('visual_embedding',{}).get('expected_state_dict_sha256')
    if expected and clip_hash != expected:
        raise RuntimeError(f'OPENCLIP_WEIGHT_SHA_MISMATCH expected={expected} actual={clip_hash}')
    qmods=[n for n,m in clip.named_modules() if m.__class__.__name__.lower()=='quickgelu']
    if cfg.get('visual_embedding',{}).get('quick_gelu_required') and not qmods:
        raise RuntimeError('OPENCLIP_QUICKGELU_CERTIFICATION_FAIL')
    return torch,sam,clip,preprocess,index,tf,clip_hash

def encode_crops(torch,clip,preprocess,crops):
    if not crops:return np.zeros((0,512),np.float32)
    out=[]
    for i in range(0,len(crops),16):
        x=torch.stack([preprocess(c.convert('RGB')) for c in crops[i:i+16]])
        with torch.inference_mode():f=clip.encode_image(x).cpu().numpy().astype(np.float32)
        out.append(normalize_rows(f))
    return np.concatenate(out,axis=0)

def sam_generate(im,cfg,sam,mode):
    if mode=='mock':return generate_mock_masks(im)
    kw=cfg['foundation_mask'];res=sam(im,points_per_batch=kw['points_per_batch'],points_per_crop=kw['points_per_crop'],crops_n_layers=kw['crops_n_layers'],pred_iou_thresh=kw['pred_iou_thresh'],stability_score_thresh=kw['stability_score_thresh'],output_bboxes_mask=True)
    out=[]
    for m,s in zip(res.get('masks',[]),res.get('scores',[])):
        if hasattr(m,'cpu'):m=m.cpu().numpy()
        elif isinstance(m,Image.Image):m=np.array(m)
        out.append((np.asarray(m).astype(bool),float(s)))
    return out

def resize_mask(m,w,h):
    if m.shape==(h,w):return m
    return np.array(Image.fromarray((m*255).astype(np.uint8)).resize((w,h),Image.Resampling.NEAREST))>0

def pair_stats(a,b):
    inter=int((a&b).sum());aa=int(a.sum());bb=int(b.sum());union=aa+bb-inter
    return {'iou':inter/max(1,union),'contain_a_in_b':inter/max(1,aa),'contain_b_in_a':inter/max(1,bb),'intersection':inter}

def deduplicate_masks(recs,cfg):
    n=len(recs);parent=list(range(n))
    def find(x):
        while parent[x]!=x:parent[x]=parent[parent[x]];x=parent[x]
        return x
    def union(a,b):
        a,b=find(a),find(b)
        if a!=b:parent[b]=a
    iou_t=cfg['foundation_mask']['near_duplicate_iou_hygiene'];cont_t=cfg['foundation_mask']['near_duplicate_mutual_containment_hygiene']
    rel=[]
    for i in range(n):
        for j in range(i+1,n):
            s=pair_stats(recs[i]['mask'],recs[j]['mask'])
            if s['iou']>=iou_t or min(s['contain_a_in_b'],s['contain_b_in_a'])>=cont_t:
                union(i,j);rel.append({'a':i,'b':j,'relation':'NEAR_DUPLICATE','metrics':s})
    clusters={}
    for i in range(n):clusters.setdefault(find(i),[]).append(i)
    keep=[];supp=[]
    for ids in clusters.values():
        ids=sorted(ids,key=lambda i:(-recs[i]['sam_predicted_iou_score'],-recs[i]['area_ratio'],recs[i]['orig_index']))
        keep.append(ids[0])
        for x in ids[1:]:supp.append({'suppressed_orig_index':recs[x]['orig_index'],'representative_orig_index':recs[ids[0]]['orig_index'],'reason':'NEAR_DUPLICATE_HYGIENE'})
    return [recs[i] for i in sorted(keep)],supp,rel

def diversify_budget(recs,maxn):
    if len(recs)<=maxn:return recs,[]
    bins=[(0,.005),(.005,.03),(.03,.15),(.15,2.)];pools=[]
    for lo,hi in bins:pools.append(sorted([r for r in recs if lo<=r['area_ratio']<hi],key=lambda r:(-r['sam_predicted_iou_score'],-r['area_ratio'],r['orig_index'])))
    out=[]
    while len(out)<maxn and any(pools):
        for p in pools:
            if p and len(out)<maxn:out.append(p.pop(0))
    kept={r['orig_index'] for r in out};sup=[{'suppressed_orig_index':r['orig_index'],'reason':'MASK_BUDGET_HYGIENE'} for r in recs if r['orig_index'] not in kept]
    return out,sup

def nesting_relations(recs,cfg):
    t=cfg['foundation_mask']['nesting_child_coverage'];rels=[]
    for i in range(len(recs)):
        for j in range(i+1,len(recs)):
            s=pair_stats(recs[i]['mask'],recs[j]['mask'])
            if s['contain_a_in_b']>=t and recs[i]['area_ratio']<recs[j]['area_ratio']:rels.append({'child_index':i,'parent_index':j,'child_coverage':s['contain_a_in_b'],'iou':s['iou']})
            elif s['contain_b_in_a']>=t and recs[j]['area_ratio']<recs[i]['area_ratio']:rels.append({'child_index':j,'parent_index':i,'child_coverage':s['contain_b_in_a'],'iou':s['iou']})
    # longest chain approximation
    parents={i:[] for i in range(len(recs))}
    for r in rels:parents[r['child_index']].append(r['parent_index'])
    def depth(i,seen=None):
        seen=set() if seen is None else seen
        if i in seen:return 0
        if not parents[i]:return 0
        return 1+max(depth(p,seen|{i}) for p in parents[i])
    return rels,max([depth(i) for i in range(len(recs))] or [0])

def multiplicity_stats(masks):
    if not masks:return {'p50':0,'p95':0,'max':0,'covered_fraction':0,'multi_covered_fraction':0,'ge5_fraction':0}
    stack=np.sum(np.stack(masks,axis=0),axis=0).astype(np.int16);flat=stack.reshape(-1)
    return {'p50':float(np.percentile(flat,50)),'p95':float(np.percentile(flat,95)),'max':int(flat.max()),'covered_fraction':float(np.mean(flat>0)),'multi_covered_fraction':float(np.mean(flat>1)),'ge5_fraction':float(np.mean(flat>=5))}

def critical_stability(im,base_masks,cfg,sam,mode):
    probes={
      'brightness_plus_3pct':ImageEnhance.Brightness(im).enhance(1.03),
      'resize_97pct':im.resize((max(8,round(im.width*.97)),max(8,round(im.height*.97))),Image.Resampling.LANCZOS).resize(im.size,Image.Resampling.LANCZOS)
    }
    out={}
    for name in cfg['stability']['probes']:
        pim=probes[name];pm=[resize_mask(m,im.width,im.height) for m,_ in sam_generate(pim,cfg,sam,mode)]
        vals=[]
        for bm in base_masks:
            vals.append(max([pair_stats(bm,x)['iou'] for x in pm] or [0.0]))
        out[name]={'best_iou_per_base_mask':vals,'median_best_iou':float(np.median(vals)) if vals else None,'p25_best_iou':float(np.percentile(vals,25)) if vals else None}
    return out

def process(item,cfg,out,mode,models=None,model_lock=None,run_fingerprint=None):
    image_id=item['image_id'];src=Path(item['source_path']);expected=item.get('source_sha256');actual=sha256_file(src)
    if expected and actual!=expected:raise RuntimeError(f'INPUT_HASH_MISMATCH {image_id} expected={expected} actual={actual}')
    im=Image.open(src).convert('RGB');arr=np.asarray(im,dtype=np.float64)/255.;h,w=arr.shape[:2]
    sam=None
    if mode!='mock':sam=models[1]
    raw=sam_generate(im,cfg,sam,mode);raw_count=len(raw)
    rec=[];area_supp=[]
    for idx,(m,s) in enumerate(raw):
        m=resize_mask(m,w,h);area=float(m.mean())
        if area<cfg['foundation_mask']['min_area_ratio_hygiene'] or area>cfg['foundation_mask']['max_area_ratio_hygiene']:
            area_supp.append({'suppressed_orig_index':idx,'reason':'AREA_HYGIENE','area_ratio':area});continue
        rec.append({'orig_index':idx,'mask':m,'sam_predicted_iou_score':float(s),'area_ratio':area,'bbox':bbox_from_mask(m),'metrics':mask_metrics(arr,m)})
    after_area=len(rec);rec,dup_supp,dup_rel=deduplicate_masks(rec,cfg);after_dedup=len(rec);rec,budget_supp=diversify_budget(rec,cfg['foundation_mask']['max_masks_per_image_hygiene']);after_budget=len(rec)
    nest,max_depth=nesting_relations(rec,cfg);mult=multiplicity_stats([r['mask'] for r in rec])
    crops=[]
    for j,r in enumerate(rec):
        hid=f'{image_id}:m{j:03d}';r['mask_hypothesis_id']=hid
        mp=out/'foundation_masks'/f'{image_id}_m{j:03d}.png';cp=out/'mask_crops'/f'{image_id}_m{j:03d}.png';Image.fromarray((r['mask']*255).astype(np.uint8),'L').save(mp);crop=mask_crop(im,r['mask'],r['bbox']);crop.save(cp)
        r['mask_asset']=str(mp.relative_to(out)).replace('\\','/');r['crop_asset']=str(cp.relative_to(out)).replace('\\','/');crops.append(crop)
    if mode=='mock':
        feats=[]
        for r in rec:
            v=np.array(r['metrics']['mean_lab']*8+[r['area_ratio']]*488,dtype=np.float32)[:512];v=v/np.clip(np.linalg.norm(v),1e-12,None);feats.append(v)
        feats=np.array(feats,np.float32);index=[]
        for axis,prompts in cfg['semantic_prior']['axes'].items():
            for label in prompts:index.append((axis,label))
        index.append(('style','concept'));tf=None;clip_hash='MOCK'
    else:
        torch,sam,clip,preprocess,index,tf,clip_hash=models;feats=encode_crops(torch,clip,preprocess,crops)
    for j,r in enumerate(rec):
        f=feats[j] if len(feats)>j else np.zeros(512,np.float32);r['visual_embedding']=[round(float(x),6) for x in f.tolist()];r['embedding_sha256']=hashlib.sha256(np.asarray(f,np.float32).tobytes()).hexdigest()
        if mode=='mock':vals=np.array([((j+k)%11)/20 for k in range(len(index))],float)
        else:vals=f@tf.T
        axes={};k=0
        for axis,prompts in cfg['semantic_prior']['axes'].items():
            scores={}
            for label in prompts:scores[label]=float(vals[k]);k+=1
            pairs=sorted(scores.items(),key=lambda x:x[1],reverse=True)
            axes[axis]={'scores':scores,'top_label':pairs[0][0] if pairs else None,'top_score':pairs[0][1] if pairs else None,'runner_up_label':pairs[1][0] if len(pairs)>1 else None,'margin':pairs[0][1]-pairs[1][1] if len(pairs)>1 else None}
        style=float(vals[k]) if len(vals)>k else None
        r['semantic_prior']={'score_semantics':'CLIP_COSINE_NOT_PROBABILITY','axes':axes,'style_similarity':style}
        r['foundation_mask_role']='FOUNDATION_MASK_HYPOTHESIS_ONLY';r['truth_claim']=False
        del r['mask'];del r['orig_index']
    # convert nesting indices to IDs after IDs fixed
    nesting=[]
    for x in nest:
        if x['child_index']<len(rec) and x['parent_index']<len(rec):nesting.append({'child_mask_id':rec[x['child_index']]['mask_hypothesis_id'],'parent_mask_id':rec[x['parent_index']]['mask_hypothesis_id'],'child_coverage':x['child_coverage'],'iou':x['iou'],'edge_type':'MASK_CONTAINMENT'})
    stab=None
    critical_ids={x['image_id'] for x in cfg.get('critical_case_registry',[])}
    if image_id in critical_ids and cfg['stability']['critical_case_only']:
        # reload masks from rec before removal via assets
        bms=[np.array(Image.open(out/r['mask_asset']))>0 for r in rec]
        stab=critical_stability(im,bms,cfg,sam,mode)
    # overlay
    prev=im.copy();pa=np.array(prev)
    for j,r in enumerate(rec):
        m=np.array(Image.open(out/r['mask_asset']))>0;bd=m&~(np.roll(m,1,0)&np.roll(m,-1,0)&np.roll(m,1,1)&np.roll(m,-1,1));yy,xx=np.where(bd);pa[yy,xx]=((37*j+73)%255,(91*j+41)%255,(151*j+19)%255)
    prev=Image.fromarray(pa);d=ImageDraw.Draw(prev)
    for j,r in enumerate(rec):x0,y0,_,_=r['bbox'];d.text((x0,y0),str(j),fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
    pp=out/'previews'/f'{image_id}_foundation_masks.png';prev.save(pp);sp=out/'source_images'/f'{image_id}.png';im.save(sp)
    return {
      'schema_version':'0.8a2.1-clean-repro','run_fingerprint_sha256':run_fingerprint,'image_id':image_id,'source_path':str(src),'source_sha256':actual,'image_size':[w,h],
      'foundation_model':(model_lock['sam_repo_id']+'@'+model_lock['resolved_revision']) if mode!='mock' else 'MOCK_TEST_ONLY','foundation_mask_truth_claim':False,
      'source_asset':str(sp.relative_to(out)).replace('\\','/'),'preview_asset':str(pp.relative_to(out)).replace('\\','/'),
      'mask_candidate_control':{'raw_mask_count':raw_count,'after_area_hygiene':after_area,'after_duplicate_hygiene':after_dedup,'final_mask_hypotheses':after_budget,'suppressed':area_supp+dup_supp+budget_supp,'near_duplicate_pairs_detected':len(dup_rel),'nesting_relation_count':len(nesting),'max_nesting_depth':max_depth,'overlap_multiplicity':mult,'semantic_decision_claim':False},
      'foundation_mask_hypotheses':rec,'mask_containment_relations':nesting,'critical_case_mask_stability':stab,'openclip_weight_sha256':clip_hash
    }

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--config',required=True);ap.add_argument('--out-dir',required=True);ap.add_argument('--mode',choices=['real','mock'],default='real');ap.add_argument('--model-lock');ap.add_argument('--run-fingerprint',required=True);a=ap.parse_args()
    cfg=json.loads(Path(a.config).read_text(encoding='utf-8'));man=json.loads(Path(a.manifest).read_text(encoding='utf-8'));out=Path(a.out_dir);out.mkdir(parents=True,exist_ok=True)
    for d in ['foundation_masks','mask_crops','previews','source_images','per_image']:(out/d).mkdir(exist_ok=True)
    model_lock=json.loads(Path(a.model_lock).read_text(encoding='utf-8')) if a.model_lock else None
    models=real_models(cfg,model_lock) if a.mode=='real' else None
    results=[]
    for n,item in enumerate(man['items'],1):
        p=out/'per_image'/f"{item['image_id']}.foundation.json"
        try:
            if p.exists():
                old=json.loads(p.read_text(encoding='utf-8'))
                if old.get('source_sha256')==item.get('source_sha256') and old.get('run_fingerprint_sha256')==a.run_fingerprint:
                    results.append(old);print(f'[{n}/{len(man["items"])}] RESUME {item["image_id"]}',flush=True);continue
                raise RuntimeError('RESUME_ENV_MISMATCH '+item['image_id'])
            print(f'[{n}/{len(man["items"])}] FOUNDATION {item["image_id"]}',flush=True)
            doc=process(item,cfg,out,a.mode,models,model_lock,a.run_fingerprint);p.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');results.append(doc)
        except Exception as e:
            print(f'ERROR {item["image_id"]}: {e}',flush=True);results.append({'image_id':item['image_id'],'error':repr(e)})
    (out/'foundation_worker_summary.json').write_text(json.dumps({'schema_version':'0.8a2.1-clean-repro','mode':a.mode,'run_fingerprint_sha256':a.run_fingerprint,'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'ok':all('error' not in r for r in results),'processed':sum('error' not in r for r in results),'total':len(results)}),flush=True)
if __name__=='__main__':main()
