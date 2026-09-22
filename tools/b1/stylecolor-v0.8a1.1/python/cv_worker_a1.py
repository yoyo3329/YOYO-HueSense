#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, math, hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from skimage.segmentation import slic, mark_boundaries
from skimage.filters import sobel

VERSION="0.8a1.1"

def srgb_to_linear(x):
    x=x.astype(np.float64)
    return np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)

def linear_to_srgb(x):
    x=np.clip(x,0,1)
    return np.where(x<=0.0031308,12.92*x,1.055*np.power(x,1/2.4)-0.055)

def linear_srgb_to_oklab(rgb):
    r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l_,m_,s_=np.cbrt(l),np.cbrt(m),np.cbrt(s)
    L=0.2104542553*l_+0.7936177850*m_-0.0040720468*s_
    A=1.9779984951*l_-2.4285922050*m_+0.4505937099*s_
    B=0.0259040371*l_+0.7827717662*m_-0.8086757660*s_
    return np.stack([L,A,B],axis=-1)

def oklab_to_linear_srgb(lab):
    L,A,B=lab[...,0],lab[...,1],lab[...,2]
    l_=L+0.3963377774*A+0.2158037573*B
    m_=L-0.1055613458*A-0.0638541728*B
    s_=L-0.0894841775*A-1.2914855480*B
    l,m,s=l_**3,m_**3,s_**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    b=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return np.stack([r,g,b],axis=-1)

def rgb01_to_oklab(rgb): return linear_srgb_to_oklab(srgb_to_linear(rgb))

def lab_to_lch(lab):
    L,a,b=map(float,lab); C=math.sqrt(a*a+b*b)
    H=None if C<1e-7 else math.degrees(math.atan2(b,a))%360
    return L,C,H

def lab_to_hex(lab):
    rgb=linear_to_srgb(oklab_to_linear_srgb(lab.reshape(1,1,3)))[0,0]
    v=np.clip(np.rint(rgb*255),0,255).astype(int)
    return "#%02X%02X%02X"%tuple(v.tolist())

def deterministic_kmeans(points,k,max_iter=12):
    if len(points)==0:return np.zeros((0,3)),np.zeros((0,),dtype=int)
    k=max(1,min(k,len(points)))
    medL=np.median(points[:,0]); idx0=int(np.argmin(np.abs(points[:,0]-medL)))
    centers=[points[idx0]]
    while len(centers)<k:
        d2=np.min(np.stack([np.sum((points-c)**2,axis=1) for c in centers]),axis=0)
        centers.append(points[int(np.argmax(d2))])
    centers=np.stack(centers).astype(float); labels=np.zeros(len(points),dtype=int)
    for it in range(max_iter):
        d=np.stack([np.sum((points-c)**2,axis=1) for c in centers],axis=1)
        new=np.argmin(d,axis=1)
        if it>0 and np.array_equal(new,labels):break
        labels=new
        for j in range(k):
            sel=points[labels==j]
            if len(sel):centers[j]=sel.mean(axis=0)
    return centers,labels

def image_sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
    return h.hexdigest()

def normalize01(vals):
    vals=np.asarray(vals,dtype=float)
    if len(vals)==0:return vals
    lo=float(np.percentile(vals,5)); hi=float(np.percentile(vals,95))
    if hi-lo<1e-12:return np.full_like(vals,.5)
    return np.clip((vals-lo)/(hi-lo),0,1)

def best_iou(mask, alt_labels):
    area=float(mask.sum())
    if area<=0:return 0.0
    ids,counts=np.unique(alt_labels[mask],return_counts=True)
    best=0.0
    for rid,inter in zip(ids,counts):
        alt=alt_labels==rid
        union=area+float(alt.sum())-float(inter)
        if union>0:best=max(best,float(inter)/union)
    return best

def adjacency_pairs(labels):
    pairs=set()
    a=labels[:,:-1]; b=labels[:,1:]; diff=a!=b
    for x,y in zip(a[diff].tolist(),b[diff].tolist()):
        pairs.add(tuple(sorted((int(x),int(y)))))
    a=labels[:-1,:]; b=labels[1:,:]; diff=a!=b
    for x,y in zip(a[diff].tolist(),b[diff].tolist()):
        pairs.add(tuple(sorted((int(x),int(y)))))
    return sorted(pairs)

def pair_boundary_stats(labels, edge, r1, r2):
    vals=[]
    # horizontal boundaries
    a=labels[:,:-1]; b=labels[:,1:]
    m=((a==r1)&(b==r2))|((a==r2)&(b==r1))
    ys,xs=np.where(m)
    if len(xs):
        vals.extend(((edge[ys,xs]+edge[ys,xs+1])/2).tolist())
    # vertical boundaries
    a=labels[:-1,:]; b=labels[1:,:]
    m=((a==r1)&(b==r2))|((a==r2)&(b==r1))
    ys,xs=np.where(m)
    if len(xs):
        vals.extend(((edge[ys,xs]+edge[ys+1,xs])/2).tolist())
    if not vals:return {"mean":0.0,"p90":0.0,"max":0.0,"support":0.0,"samples":0}
    arr=np.asarray(vals,float)
    thr=float(np.percentile(edge,75))
    return {"mean":float(arr.mean()),"p90":float(np.percentile(arr,90)),"max":float(arr.max()),
            "support":float(np.mean(arr>thr)),"samples":int(len(arr))}

def perturb_images(im):
    return {
      "brightness_minus_3pct":ImageEnhance.Brightness(im).enhance(.97),
      "brightness_plus_3pct":ImageEnhance.Brightness(im).enhance(1.03),
      "contrast_plus_3pct":ImageEnhance.Contrast(im).enhance(1.03),
      "tiny_blur":im.filter(ImageFilter.GaussianBlur(radius=.55)),
    }

def make_segments(arr,n_segments,compactness):
    return slic(arr,n_segments=max(4,int(n_segments)),compactness=compactness,start_label=0,
                channel_axis=-1,enforce_connectivity=True,slic_zero=False)

def process_image(src,image_id,out,segments=28,compactness=10.0,max_dim=512,palette_k=2,scale_mult=(.75,1.25,1.5)):
    for d in ["masks","crops","context_crops","previews","source_images"]:
        (out/d).mkdir(parents=True,exist_ok=True)
    im=Image.open(src).convert("RGB")
    ow,oh=im.size; scale=min(1.0,max_dim/max(ow,oh))
    if scale<1:im=im.resize((max(1,round(ow*scale)),max(1,round(oh*scale))),Image.Resampling.LANCZOS)
    w,h=im.size
    arr=np.asarray(im,dtype=np.float64)/255.0
    lab=rgb01_to_oklab(arr)
    gray=.2126*arr[:,:,0]+.7152*arr[:,:,1]+.0722*arr[:,:,2]
    edge=sobel(gray)
    labels=make_segments(arr,segments,compactness)
    region_ids=np.unique(labels)

    # Multi-scale partitions
    alt_scales=[]
    for m in scale_mult:
        alt_scales.append((float(m),make_segments(arr,round(segments*m),compactness)))

    # Small perturbations, same base segment request
    pert=[]
    for name,pim in perturb_images(im).items():
        parr=np.asarray(pim,dtype=np.float64)/255.0
        pert.append((name,make_segments(parr,segments,compactness)))

    global_lab=lab.reshape(-1,3).mean(axis=0)
    rows=[]
    for rid in region_ids:
        mask=labels==rid; count=int(mask.sum()); ys,xs=np.where(mask); pix=lab[mask]
        mean_lab=pix.mean(axis=0); L=pix[:,0]
        spread=float(np.percentile(L,90)-np.percentile(L,10))
        rows.append({
          "rid":int(rid),"mask":mask,"count":count,"area":count/(w*h),"ys":ys,"xs":xs,"pix":pix,
          "mean_lab":mean_lab,"light_spread":spread,
          "color_contrast":float(np.linalg.norm(mean_lab-global_lab)),
          "edge_density":float(edge[mask].mean()),
          "center":1-min(1,math.sqrt((float(xs.mean()/max(1,w-1))-.5)**2+(float(ys.mean()/max(1,h-1))-.5)**2)/.7071)
        })

    contrast_n=normalize01([r["color_contrast"] for r in rows])
    edge_n=normalize01([r["edge_density"] for r in rows])

    regions=[]
    byid={}
    for ix,r in enumerate(rows):
        rid=r["rid"]; mask=r["mask"]; pix=r["pix"]; L=pix[:,0]
        mean_lab=r["mean_lab"]  # IMPORTANT: region-local mean; do not reuse stale value from previous loop.
        lo,hi=np.percentile(L,[5,95]); trim=pix[(L>=lo)&(L<=hi)]
        if len(trim)<24:trim=pix
        if len(trim)>2200:trim=trim[::max(1,len(trim)//2200)]
        centers,klabels=deterministic_kmeans(trim,palette_k)
        pal=[]
        for j,c in enumerate(centers):
            ratio=float(np.mean(klabels==j)) if len(klabels) else 0.0
            ll,cc,hh=lab_to_lch(c)
            pal.append({"hex":lab_to_hex(c),"ratio_within_region":ratio,
              "lab":{"L":float(c[0]),"a":float(c[1]),"b":float(c[2])},
              "lch":{"L":ll,"C":cc,"H":hh}})
        pal.sort(key=lambda x:x["ratio_within_region"],reverse=True)

        component_contrast=0.0
        if len(pal)>=2:
            c1=np.array([pal[0]["lab"]["L"],pal[0]["lab"]["a"],pal[0]["lab"]["b"]])
            c2=np.array([pal[1]["lab"]["L"],pal[1]["lab"]["a"],pal[1]["lab"]["b"]])
            component_contrast=float(np.linalg.norm(c1-c2))
        dom=float(pal[0]["ratio_within_region"]) if pal else 1.0
        sec=float(pal[1]["ratio_within_region"]) if len(pal)>1 else 0.0

        # Scores are explicitly heuristic, NOT probabilities.
        color_var=float(np.mean(np.sum((pix-mean_lab)**2,axis=1)))
        color_homogeneity=float(math.exp(-color_var/0.006))
        component_balance=float(1.0-abs(dom-sec)) if len(pal)>=2 else 0.0
        bimodal_score=float(np.clip((component_contrast/0.22)*component_balance,0,1))
        dilution_score=float(np.clip((dom-.62)/.38,0,1)*np.clip(component_contrast/.20,0,1)*np.clip(sec/.20,0,1))
        minority_contrast_signal=float(np.clip(component_contrast/.20,0,1)*np.clip(sec/.18,0,1))

        scale_iou=[{"scale_multiplier":m,"best_iou":best_iou(mask,alt)} for m,alt in alt_scales]
        perturb_iou=[{"perturbation":name,"best_iou":best_iou(mask,pl)} for name,pl in pert]
        scale_stability=float(np.mean([x["best_iou"] for x in scale_iou])) if scale_iou else 1.0
        perturb_stability=float(np.mean([x["best_iou"] for x in perturb_iou])) if perturb_iou else 1.0

        flags=[]
        if r["area"]<.012:flags.append("TINY_ATOMIC_REGION")
        if bimodal_score>.55:flags.append("REGION_BIMODAL_COLOR")
        if dilution_score>.35:flags.append("REGION_BACKGROUND_DOMINATED_HIGH_CONTRAST_MIXTURE")
        if scale_stability<.45:flags.append("REGION_SCALE_SENSITIVE")
        if perturb_stability<.45:flags.append("REGION_PERTURBATION_SENSITIVE")
        if r["light_spread"]>.32:flags.append("REGION_HIGH_INTERNAL_LIGHTNESS_SPREAD")
        if color_homogeneity<.45:flags.append("REGION_LOW_COLOR_HOMOGENEITY")

        saliency=float(np.clip(.55*contrast_n[ix]+.25*edge_n[ix]+.20*r["center"],0,1))
        x0,x1=int(r["xs"].min()),int(r["xs"].max())+1
        y0,y1=int(r["ys"].min()),int(r["ys"].max())+1

        crop_arr=np.full((y1-y0,x1-x0,3),.47,dtype=np.float64)
        submask=mask[y0:y1,x0:x1]
        crop_arr[submask]=arr[y0:y1,x0:x1][submask]
        crop_rel=f"crops/{image_id}_r{rid:02d}.png"
        Image.fromarray(np.clip(np.rint(crop_arr*255),0,255).astype(np.uint8),"RGB").save(out/crop_rel)

        pad=max(4,int(.15*max(x1-x0,y1-y0)))
        cx0=max(0,x0-pad); cy0=max(0,y0-pad); cx1=min(w,x1+pad); cy1=min(h,y1+pad)
        context_rel=f"context_crops/{image_id}_r{rid:02d}.png"
        Image.fromarray(np.clip(np.rint(arr[cy0:cy1,cx0:cx1]*255),0,255).astype(np.uint8),"RGB").save(out/context_rel)

        mask_rel=f"masks/{image_id}_r{rid:02d}.png"
        Image.fromarray((mask*255).astype(np.uint8),"L").save(out/mask_rel)

        region={
          "region_id":f"{image_id}:r{rid:02d}","region_index":rid,"atomic":True,"immutable":True,
          "bbox":[x0,y0,x1,y1],"area_ratio":r["area"],"mean_lab":{"L":float(mean_lab[0]),"a":float(mean_lab[1]),"b":float(mean_lab[2])},
          "saliency_proxy":saliency,"edge_density":r["edge_density"],"lightness_spread_p10_p90":r["light_spread"],
          "palette":pal,"crop_asset":crop_rel,"clip_asset":context_rel,"mask_asset":mask_rel,
          "diagnostics":{
            "score_semantics":"HEURISTIC_SCORE_NOT_PROBABILITY",
            "color_homogeneity_score":color_homogeneity,
            "bimodal_color_score":bimodal_score,
            "foreground_dilution_score":dilution_score,
            "minority_contrast_signal_score":minority_contrast_signal,
            "scale_stability_score":scale_stability,
            "perturbation_stability_score":perturb_stability,
            "scale_details":scale_iou,
            "perturbation_details":perturb_iou,
            "flags":flags,
            "semantic_prior_status":"DEFERRED_TO_v0.8-A.2",
            "embedding_agreement_status":"DEFERRED_TO_v0.8-A.2"
          },
          "clip_style_similarity":None,"clip_status":"PENDING",
          "clip_input_coherence_score":float(np.clip(.45*color_homogeneity+.30*scale_stability+.25*perturb_stability,0,1))
        }
        regions.append(region); byid[rid]=region

    # Relationship graph over immutable atomic regions.
    edges=[]
    for a,b in adjacency_pairs(labels):
        ra,rb=byid[a],byid[b]
        ma=np.array([ra["mean_lab"]["L"],ra["mean_lab"]["a"],ra["mean_lab"]["b"]])
        mb=np.array([rb["mean_lab"]["L"],rb["mean_lab"]["a"],rb["mean_lab"]["b"]])
        delta=float(np.linalg.norm(ma-mb))
        color_sim=float(math.exp(-delta/.08))
        bs=pair_boundary_stats(labels,edge,a,b)
        boundary_weak=float(np.clip(1-bs["support"],0,1))
        texture_similarity=float(math.exp(-abs(ra["edge_density"]-rb["edge_density"])/.08))
        scale_agree=float((ra["diagnostics"]["scale_stability_score"]+rb["diagnostics"]["scale_stability_score"])/2)
        perturb_agree=float((ra["diagnostics"]["perturbation_stability_score"]+rb["diagnostics"]["perturbation_stability_score"])/2)
        combined_area=float(ra["area_ratio"]+rb["area_ratio"])
        palette_impact=float(np.clip(combined_area*min(1,delta/.20),0,1))
        contradictions=[]
        if bs["support"]>.35:contradictions.append("BOUNDARY_EVIDENCE_AGAINST_GROUPING")
        if delta>.14:contradictions.append("COLOR_MODEL_CONTRADICTION")
        if min(scale_agree,perturb_agree)<.45:contradictions.append("STABILITY_CONTRADICTION")
        if palette_impact>.20:contradictions.append("HIGH_PALETTE_IMPACT")
        if color_sim>.80 and not contradictions:
            action="LINK_SIMILAR_COLOR_STRONG_GROUPING_CANDIDATE"
        elif color_sim>.65:
            action="KEEP_SEPARATE_BUT_LINK_SIMILAR_COLOR"
        else:
            action="KEEP_SEPARATE_SPATIAL_LINK"
        edges.append({
          "edge_id":f"{image_id}:e{a:02d}_{b:02d}",
          "source_region_id":ra["region_id"],"target_region_id":rb["region_id"],
          "relationship_type":"ATOMIC_REGION_ADJACENCY",
          "evidence":{
            "score_semantics":"HEURISTIC_SCORE_NOT_PROBABILITY",
            "spatial_adjacent":True,
            "oklab_delta":delta,
            "color_similarity_score":color_sim,
            "boundary_mean":bs["mean"],"boundary_p90":bs["p90"],"boundary_max":bs["max"],
            "boundary_strong_support_ratio":bs["support"],
            "boundary_weakness_score":boundary_weak,
            "texture_similarity_score":texture_similarity,
            "scale_stability_agreement_score":scale_agree,
            "perturbation_stability_agreement_score":perturb_agree,
            "palette_impact_score":palette_impact,
            "semantic_mask_agreement":None,
            "embedding_agreement":None
          },
          "contradictions":contradictions,
          "action":action,
          "destructive_merge_executed":False
        })

    # Preview
    boundary=(mark_boundaries(arr,labels,color=(1,1,1),mode="thick")*255).astype(np.uint8)
    prev=Image.fromarray(boundary,"RGB"); draw=ImageDraw.Draw(prev)
    for r in rows:
        cx=int(r["xs"].mean()); cy=int(r["ys"].mean())
        draw.rectangle([cx-10,cy-8,cx+10,cy+8],fill=(20,20,20))
        draw.text((cx-7,cy-7),str(r["rid"]),fill=(255,255,255))
    preview_rel=f"previews/{image_id}_atomic_regions.png"; prev.save(out/preview_rel)
    source_rel=f"source_images/{image_id}.jpg"; im.save(out/source_rel,quality=90)

    doc={
      "schema_version":"0.8a1.1","worker_version":VERSION,"image_id":image_id,
      "source_path":str(src.resolve()),"source_sha256":image_sha256(src),
      "original_size":[ow,oh],"analysis_size":[w,h],
      "atomic_region_engine":{
        "name":"SLIC_ATOMIC_BASELINE","semantic_claim":False,"destructive_merge":False,
        "segments_requested":segments,"segments_observed":len(regions),"compactness":compactness
      },
      "stability_policy":{
        "multiscale_segment_multipliers":list(scale_mult),
        "perturbations":[x[0] for x in pert],
        "metric":"BEST_IOU_TO_ALTERNATE_PARTITION"
      },
      "source_image_asset":source_rel,"region_preview_asset":preview_rel,
      "atomic_regions":regions,"relationship_edges":edges
    }
    p=out/f"{image_id}.atomic.json"
    p.write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding="utf-8")
    return {"ok":True,"image_id":image_id,"atomic_regions":len(regions),"edges":len(edges),"output":str(p)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--batch-manifest"); ap.add_argument("--out-dir",required=True)
    ap.add_argument("--segments",type=int,default=28); ap.add_argument("--compactness",type=float,default=10.0)
    ap.add_argument("--max-dim",type=int,default=512); ap.add_argument("--palette-k",type=int,default=2)
    ap.add_argument("--scale-multipliers",default=".75,1.25,1.5")
    a=ap.parse_args()
    out=Path(a.out_dir); out.mkdir(parents=True,exist_ok=True)
    mult=tuple(float(x) for x in a.scale_multipliers.split(",") if x.strip())
    if not a.batch_manifest: raise SystemExit("--batch-manifest required")
    batch=json.loads(Path(a.batch_manifest).read_text(encoding="utf-8"))
    results=[]
    for item in batch["items"]:
        try:
            results.append(process_image(Path(item["image"]),item["image_id"],out,a.segments,a.compactness,a.max_dim,a.palette_k,mult))
        except Exception as e:
            results.append({"ok":False,"image_id":item.get("image_id"),"error":repr(e)})
    (out/"cv_batch_summary.json").write_text(json.dumps({"schema_version":"0.8a1.1","results":results},indent=2),encoding="utf-8")
    print(json.dumps({"ok":all(x["ok"] for x in results),"processed":sum(x["ok"] for x in results),"total":len(results)}))
if __name__=="__main__":main()
