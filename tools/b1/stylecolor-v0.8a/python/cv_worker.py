#!/usr/bin/env python3
from __future__ import annotations

import argparse, json, math, hashlib, os, sys
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw
from skimage.segmentation import slic, mark_boundaries
from skimage.filters import sobel

VERSION = "0.8a.0"


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    x = x.astype(np.float64)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def linear_srgb_to_oklab(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    return np.stack([L, A, B], axis=-1)


def oklab_to_linear_srgb(lab: np.ndarray) -> np.ndarray:
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return np.stack([r, g, b], axis=-1)


def rgb01_to_oklab(rgb: np.ndarray) -> np.ndarray:
    return linear_srgb_to_oklab(srgb_to_linear(rgb))


def lab_to_lch(lab: np.ndarray) -> tuple[float, float, float | None]:
    L, a, b = map(float, lab)
    C = math.sqrt(a*a+b*b)
    if C < 1e-7:
        return L, C, None
    H = math.degrees(math.atan2(b, a)) % 360
    return L, C, H


def lab_to_hex(lab: np.ndarray) -> str:
    rgb = linear_to_srgb(oklab_to_linear_srgb(lab.reshape(1, 1, 3)))[0, 0]
    vals = np.clip(np.rint(rgb * 255), 0, 255).astype(int)
    return "#%02X%02X%02X" % tuple(vals.tolist())


def deterministic_kmeans(points: np.ndarray, k: int, max_iter: int = 12) -> tuple[np.ndarray, np.ndarray]:
    if len(points) == 0:
        return np.zeros((0,3)), np.zeros((0,), dtype=int)
    k = max(1, min(k, len(points)))
    # deterministic farthest-point init starting at median-lightness sample
    medL = np.median(points[:,0])
    idx0 = int(np.argmin(np.abs(points[:,0]-medL)))
    centers=[points[idx0]]
    while len(centers)<k:
        d2=np.min(np.stack([np.sum((points-c)**2,axis=1) for c in centers]),axis=0)
        centers.append(points[int(np.argmax(d2))])
    centers=np.stack(centers).astype(float)
    labels=np.zeros(len(points),dtype=int)
    for _ in range(max_iter):
        d=np.stack([np.sum((points-c)**2,axis=1) for c in centers],axis=1)
        new=np.argmin(d,axis=1)
        if np.array_equal(new,labels) and _>0:
            break
        labels=new
        for j in range(k):
            sel=points[labels==j]
            if len(sel): centers[j]=sel.mean(axis=0)
    return centers,labels


def normalize01(v: np.ndarray) -> np.ndarray:
    if len(v)==0: return v
    lo=float(np.percentile(v,5)); hi=float(np.percentile(v,95))
    if hi-lo<1e-9: return np.full_like(v,0.5,dtype=float)
    return np.clip((v-lo)/(hi-lo),0,1)


def image_sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()



def process_image(src: Path, image_id: str, out: Path, segments: int=28, compactness: float=10.0, max_dim: int=512, palette_k: int=2) -> dict:
    mask_dir=out/'masks'; crop_dir=out/'crops'; preview_dir=out/'previews'; source_dir=out/'source_images'
    for d in [mask_dir,crop_dir,preview_dir,source_dir]: d.mkdir(parents=True,exist_ok=True)

    im=Image.open(src).convert('RGB')
    ow,oh=im.size
    scale=min(1.0,max_dim/max(ow,oh))
    if scale<1:
        im=im.resize((max(1,round(ow*scale)),max(1,round(oh*scale))),Image.Resampling.LANCZOS)
    w,h=im.size
    arr=np.asarray(im,dtype=np.float64)/255.0
    lab=rgb01_to_oklab(arr)
    gray=0.2126*arr[:,:,0]+0.7152*arr[:,:,1]+0.0722*arr[:,:,2]
    edge=sobel(gray)

    labels=slic(arr,n_segments=segments,compactness=compactness,start_label=0,channel_axis=-1,enforce_connectivity=True,slic_zero=False)
    region_ids=np.unique(labels)
    global_lab=lab.reshape(-1,3).mean(axis=0)

    rows=[]
    for rid in region_ids:
        mask=labels==rid; count=int(mask.sum()); area=count/(w*h)
        ys,xs=np.where(mask)
        pix=lab[mask]; mean_lab=pix.mean(axis=0)
        L=pix[:,0]; spread=float(np.percentile(L,90)-np.percentile(L,10))
        rows.append(dict(rid=int(rid),mask=mask,count=count,area=area,ys=ys,xs=xs,pix=pix,mean_lab=mean_lab,
                         light_spread=spread,color_contrast=float(np.linalg.norm(mean_lab-global_lab)),edge_density=float(edge[mask].mean()),
                         center=1-min(1,math.sqrt((float(xs.mean()/max(1,w-1))-.5)**2+(float(ys.mean()/max(1,h-1))-.5)**2)/.7071)))

    contrast_n=normalize01(np.array([r['color_contrast'] for r in rows]))
    edge_n=normalize01(np.array([r['edge_density'] for r in rows]))
    regions=[]
    for ix,r in enumerate(rows):
        rid=r['rid']; mask=r['mask']; pix=r['pix']; L=pix[:,0]
        lo,hi=np.percentile(L,[5,95]); trim=pix[(L>=lo)&(L<=hi)]
        if len(trim)<24: trim=pix
        if len(trim)>1800: trim=trim[::max(1,len(trim)//1800)]
        centers,klabels=deterministic_kmeans(trim,palette_k)
        pal=[]
        for j,c in enumerate(centers):
            ratio=float(np.mean(klabels==j)) if len(klabels) else 0
            ll,cc,hh=lab_to_lch(c)
            pal.append({'hex':lab_to_hex(c),'ratio_within_region':ratio,'lab':{'L':float(c[0]),'a':float(c[1]),'b':float(c[2])},'lch':{'L':ll,'C':cc,'H':hh}})
        pal.sort(key=lambda x:x['ratio_within_region'],reverse=True)
        medL=float(np.median(L)); reasons=[]; reliability=1.0
        if r['area']<0.012: reasons.append('tiny_region'); reliability*=0.45
        if medL<0.10: reasons.append('extreme_dark'); reliability*=0.55
        if medL>0.94: reasons.append('extreme_highlight'); reliability*=0.55
        if r['light_spread']>0.32: reasons.append('high_internal_lightness_spread'); reliability*=0.70
        stability=max(0.0,min(1.0,1-r['light_spread']/0.45))
        saliency=float(np.clip(.55*contrast_n[ix]+.25*edge_n[ix]+.20*r['center'],0,1))
        x0,x1=int(r['xs'].min()),int(r['xs'].max())+1; y0,y1=int(r['ys'].min()),int(r['ys'].max())+1
        crop_arr=np.full((y1-y0,x1-x0,3),0.47,dtype=np.float64); submask=mask[y0:y1,x0:x1]
        crop_arr[submask]=arr[y0:y1,x0:x1][submask]
        crop=Image.fromarray(np.clip(np.rint(crop_arr*255),0,255).astype(np.uint8),'RGB')
        crop_rel=f'crops/{image_id}_r{rid:02d}.png'; crop.save(out/crop_rel,optimize=False)
        mask_img=Image.fromarray((mask*255).astype(np.uint8),'L'); mask_rel=f'masks/{image_id}_r{rid:02d}.png'; mask_img.save(out/mask_rel,optimize=False)
        regions.append({'region_id':f'{image_id}:r{rid:02d}','region_index':rid,'bbox':[x0,y0,x1,y1],'area_ratio':r['area'],
            'saliency_proxy':saliency,'region_stability':stability,'illumination_reliability':reliability,'low_reliability_reasons':reasons,
            'lightness_median':medL,'lightness_spread_p10_p90':r['light_spread'],'color_contrast_to_image':r['color_contrast'],
            'edge_density':r['edge_density'],'center_prior':r['center'],'palette':pal,'crop_asset':crop_rel,'mask_asset':mask_rel,
            'clip_style_similarity':None,'clip_status':'PENDING'})

    boundary=(mark_boundaries(arr,labels,color=(1,1,1),mode='thick')*255).astype(np.uint8)
    prev=Image.fromarray(boundary,'RGB'); draw=ImageDraw.Draw(prev)
    for r in rows:
        cx=int(r['xs'].mean()); cy=int(r['ys'].mean()); draw.rectangle([cx-10,cy-8,cx+10,cy+8],fill=(20,20,20)); draw.text((cx-7,cy-7),str(r['rid']),fill=(255,255,255))
    preview_rel=f'previews/{image_id}_regions.png'; prev.save(out/preview_rel,optimize=False)
    source_rel=f'source_images/{image_id}.jpg'; im.save(out/source_rel,quality=90,optimize=False)
    result={'schema_version':'0.8a.0','worker_version':VERSION,'image_id':image_id,'source_path':str(src.resolve()),'source_sha256':image_sha256(src),
        'original_size':[ow,oh],'analysis_size':[w,h],
        'region_engine':{'name':'SLIC_REGION_PROPOSAL_BASELINE','semantic_claim':False,'segments_requested':segments,'segments_observed':len(regions),'compactness':compactness},
        'saliency_engine':{'name':'DETERMINISTIC_PROXY','components':['OKLab global contrast','Sobel edge density','center prior'],'semantic_claim':False},
        'illumination_policy':{'mode':'DOWNWEIGHT_NOT_DELETE','palette_lightness_trim_percent':[5,95]},
        'source_image_asset':source_rel,'region_preview_asset':preview_rel,'regions':regions}
    out_json=out/f'{image_id}.regions.json'; out_json.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'ok':True,'image_id':image_id,'regions':len(regions),'output':str(out_json)}


def parse_args():
    p=argparse.ArgumentParser()
    p.add_argument('--image'); p.add_argument('--image-id'); p.add_argument('--batch-manifest')
    p.add_argument('--out-dir',required=True); p.add_argument('--segments',type=int,default=28); p.add_argument('--compactness',type=float,default=10.0)
    p.add_argument('--max-dim',type=int,default=512); p.add_argument('--palette-k',type=int,default=2)
    return p.parse_args()


def main():
    a=parse_args(); out=Path(a.out_dir); out.mkdir(parents=True,exist_ok=True)
    if a.batch_manifest:
        batch=json.loads(Path(a.batch_manifest).read_text(encoding='utf-8'))
        results=[]
        for i,item in enumerate(batch.get('items',[]),1):
            try:
                r=process_image(Path(item['image']),str(item['image_id']),out,a.segments,a.compactness,a.max_dim,a.palette_k)
                results.append(r); print(f"[{i}/{len(batch['items'])}] {item['image_id']} OK regions={r['regions']}",flush=True)
            except Exception as e:
                results.append({'ok':False,'image_id':item.get('image_id'),'error':repr(e)})
                print(f"[{i}/{len(batch['items'])}] {item.get('image_id')} FAIL {e}",file=sys.stderr,flush=True)
        summary={'ok':all(r.get('ok') for r in results),'processed':sum(bool(r.get('ok')) for r in results),'failed':sum(not bool(r.get('ok')) for r in results),'results':results}
        Path(out/'cv_batch_summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False)); return
    if not a.image or not a.image_id: raise SystemExit('--image and --image-id required unless --batch-manifest is used')
    print(json.dumps(process_image(Path(a.image),a.image_id,out,a.segments,a.compactness,a.max_dim,a.palette_k),ensure_ascii=False))

if __name__=='__main__': main()
