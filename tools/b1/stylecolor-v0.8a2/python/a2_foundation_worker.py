#!/usr/bin/env python3
from __future__ import annotations
import os,sys,json,math,hashlib,argparse,time
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw

VERSION='0.8a2.0'

def sha256_file(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
 return h.hexdigest()

def srgb_to_linear(x):
 x=x.astype(np.float64)
 return np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
def linear_srgb_to_oklab(rgb):
 r,g,b=rgb[...,0],rgb[...,1],rgb[...,2]
 l=.4122214708*r+.5363325363*g+.0514459929*b
 m=.2119034982*r+.6806995451*g+.1073969566*b
 s=.0883024619*r+.2817188376*g+.6299787005*b
 l_,m_,s_=np.cbrt(l),np.cbrt(m),np.cbrt(s)
 L=.2104542553*l_+.7936177850*m_-.0040720468*s_
 A=1.9779984951*l_-2.4285922050*m_+.4505937099*s_
 B=.0259040371*l_+.7827717662*m_-.8086757660*s_
 return np.stack([L,A,B],axis=-1)
def rgb01_to_oklab(x):return linear_srgb_to_oklab(srgb_to_linear(x))
def oklab_to_linear_srgb(lab):
 L,A,B=lab[...,0],lab[...,1],lab[...,2]
 l_=L+.3963377774*A+.2158037573*B;m_=L-.1055613458*A-.0638541728*B;s_=L-.0894841775*A-1.2914855480*B
 l,m,s=l_**3,m_**3,s_**3
 return np.stack([4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s],axis=-1)
def linear_to_srgb(x):
 x=np.clip(x,0,1);return np.where(x<=.0031308,12.92*x,1.055*np.power(x,1/2.4)-.055)
def lab_to_hex(l):
 rgb=linear_to_srgb(oklab_to_linear_srgb(np.asarray(l).reshape(1,1,3)))[0,0]
 v=np.clip(np.rint(rgb*255),0,255).astype(int);return '#%02X%02X%02X'%tuple(v.tolist())
def deterministic_kmeans(points,k=2,max_iter=12):
 if len(points)==0:return np.zeros((0,3)),np.zeros((0,),int)
 k=max(1,min(k,len(points))); med=np.median(points[:,0]);cent=[points[int(np.argmin(np.abs(points[:,0]-med)))]]
 while len(cent)<k:
  d=np.min(np.stack([np.sum((points-c)**2,axis=1) for c in cent]),axis=0);cent.append(points[int(np.argmax(d))])
 cent=np.stack(cent).astype(float);lab=np.zeros(len(points),int)
 for it in range(max_iter):
  d=np.stack([np.sum((points-c)**2,axis=1) for c in cent],axis=1);new=np.argmin(d,axis=1)
  if it and np.array_equal(new,lab):break
  lab=new
  for j in range(k):
   s=points[lab==j]
   if len(s):cent[j]=s.mean(axis=0)
 return cent,lab

def mask_metrics(arr,mask):
 pix=rgb01_to_oklab(arr[mask])
 if len(pix)==0:return None
 mean=pix.mean(axis=0); var=float(np.mean(np.sum((pix-mean)**2,axis=1))); homog=float(math.exp(-var/.006))
 L=pix[:,0]; spread=float(np.percentile(L,90)-np.percentile(L,10))
 sample=pix[::max(1,len(pix)//2200)]
 centers,labels=deterministic_kmeans(sample,2); pal=[]
 for j,c in enumerate(centers):
  pal.append({'hex':lab_to_hex(c),'ratio_within_mask':float(np.mean(labels==j)),'lab':[float(x) for x in c]})
 pal.sort(key=lambda x:x['ratio_within_mask'],reverse=True)
 contrast=0.;bimodal=0.
 if len(pal)>1:
  c1=np.array(pal[0]['lab']);c2=np.array(pal[1]['lab']);contrast=float(np.linalg.norm(c1-c2));bal=1-abs(pal[0]['ratio_within_mask']-pal[1]['ratio_within_mask']);bimodal=float(np.clip(contrast/.22*bal,0,1))
 return {'mean_lab':[float(x) for x in mean],'color_homogeneity_score':homog,'lightness_spread_p10_p90':spread,'bimodal_color_score':bimodal,'palette':pal}

def bbox_from_mask(m):
 ys,xs=np.where(m)
 if not len(xs):return [0,0,0,0]
 return [int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1]
def mask_crop(im,mask,bbox,bg=119):
 a=np.asarray(im).copy();x0,y0,x1,y1=bbox;sub=a[y0:y1,x0:x1];sm=mask[y0:y1,x0:x1]
 out=np.full_like(sub,bg);out[sm]=sub[sm];return Image.fromarray(out)

def generate_mock_masks(im):
 # Deterministic build-time fallback only; NOT used for real A2 claims.
 arr=np.asarray(im.convert('RGB')); gray=arr.mean(axis=2)
 qs=np.quantile(gray,[.33,.66]); masks=[]
 for lo,hi in [(-1,qs[0]),(qs[0],qs[1]),(qs[1],256)]:
  m=(gray>lo)&(gray<=hi)
  if m.mean()>.002:masks.append((m,float(.5)))
 return masks

def normalize(v):
 n=np.linalg.norm(v);return v if n<1e-12 else v/n

def real_models(cfg):
 import torch,open_clip
 from transformers import pipeline
 device='cpu';torch.set_grad_enabled(False);torch.set_num_threads(max(1,min(8,(os.cpu_count() or 4)-1)))
 print('Loading SAM2 foundation model...',flush=True)
 sam=pipeline('mask-generation',model=cfg['foundation_mask']['model'],device=-1)
 print('Loading OpenCLIP visual model...',flush=True)
 clip,_,preprocess=open_clip.create_model_and_transforms(cfg['visual_embedding']['model'],pretrained=cfg['visual_embedding']['pretrained'],device=device)
 clip.eval();tok=open_clip.get_tokenizer(cfg['visual_embedding']['model'])
 prompts=cfg['semantic_prior']['prompts']; keys=list(prompts)
 texts=[prompts[k] for k in keys]+[cfg['concept']]
 with torch.inference_mode():
  tf=normalize(clip.encode_text(tok(texts).to(device)).cpu().numpy().astype(np.float32),) if False else clip.encode_text(tok(texts).to(device)).cpu().numpy().astype(np.float32)
 tf=tf/np.clip(np.linalg.norm(tf,axis=1,keepdims=True),1e-12,None)
 return torch,sam,clip,preprocess,keys,tf

def encode_crops(torch,clip,preprocess,crops):
 if not crops:return np.zeros((0,512),np.float32)
 out=[]
 bs=16
 for i in range(0,len(crops),bs):
  x=torch.stack([preprocess(c.convert('RGB')) for c in crops[i:i+bs]])
  with torch.inference_mode():f=clip.encode_image(x).cpu().numpy().astype(np.float32)
  f=f/np.clip(np.linalg.norm(f,axis=1,keepdims=True),1e-12,None);out.append(f)
 return np.concatenate(out,axis=0)

def process(item,cfg,out,mode,models=None):
 image_id=item['image_id']; src=Path(item['source_path']); expected=item.get('source_sha256')
 actual=sha256_file(src)
 if expected and actual!=expected:raise RuntimeError(f'INPUT_HASH_MISMATCH {image_id} expected={expected} actual={actual}')
 im=Image.open(src).convert('RGB'); arr=np.asarray(im,dtype=np.float64)/255.; h,w=arr.shape[:2]
 raw_masks=[]; scores=[]
 if mode=='mock':
  for m,s in generate_mock_masks(im):raw_masks.append(m);scores.append(s)
 else:
  torch,sam,clip,preprocess,keys,tf=models
  kw=cfg['foundation_mask']
  res=sam(im,points_per_batch=kw['points_per_batch'],points_per_crop=kw['points_per_crop'],crops_n_layers=kw['crops_n_layers'],pred_iou_thresh=kw['pred_iou_thresh'],stability_score_thresh=kw['stability_score_thresh'],output_bboxes_mask=True)
  for m,s in zip(res.get('masks',[]),res.get('scores',[])):
   if hasattr(m,'cpu'):m=m.cpu().numpy()
   elif isinstance(m,Image.Image):m=np.array(m)
   m=np.asarray(m).astype(bool)
   if m.shape!=(h,w):m=np.array(Image.fromarray((m*255).astype(np.uint8)).resize((w,h),Image.Resampling.NEAREST))>0
   raw_masks.append(m);scores.append(float(s))
 # Filter + sort. Filters are pipeline hygiene, not semantic truth.
 rec=[]
 for idx,(m,s) in enumerate(zip(raw_masks,scores)):
  area=float(m.mean())
  if area<cfg['foundation_mask']['min_area_ratio'] or area>cfg['foundation_mask']['max_area_ratio']:continue
  bb=bbox_from_mask(m);met=mask_metrics(arr,m)
  rec.append({'orig_index':idx,'mask':m,'sam_predicted_iou_score':s,'area_ratio':area,'bbox':bb,'metrics':met})
 rec.sort(key=lambda x:(-x['sam_predicted_iou_score'],-x['area_ratio'],x['orig_index']))
 rec=rec[:cfg['foundation_mask']['max_masks_per_image']]
 # Save masks/crops and embeddings
 crops=[]
 for j,r in enumerate(rec):
  gid=f'{image_id}:g{j:03d}';r['group_id']=gid
  mp=out/'foundation_masks'/f'{image_id}_g{j:03d}.png';cp=out/'group_crops'/f'{image_id}_g{j:03d}.png'
  Image.fromarray((r['mask']*255).astype(np.uint8),'L').save(mp);crop=mask_crop(im,r['mask'],r['bbox']);crop.save(cp)
  r['mask_asset']=str(mp.relative_to(out)).replace('\\','/');r['crop_asset']=str(cp.relative_to(out)).replace('\\','/');crops.append(crop)
 if mode=='mock':
  # deterministic pseudo embeddings for tests only
  feats=[]
  for r in rec:
   v=np.array(r['metrics']['mean_lab']*8+[r['area_ratio']]*488,dtype=np.float32)[:512];v=v/np.clip(np.linalg.norm(v),1e-12,None);feats.append(v)
  feats=np.array(feats,np.float32);keys=list(cfg['semantic_prior']['prompts']);tf=None
 else:feats=encode_crops(torch,clip,preprocess,crops)
 for j,r in enumerate(rec):
  f=feats[j] if len(feats)>j else np.zeros(512,np.float32);r['visual_embedding']=[round(float(x),6) for x in f.tolist()]
  r['embedding_sha256']=hashlib.sha256(np.asarray(f,np.float32).tobytes()).hexdigest()
  if mode=='mock':
   labs=list(cfg['semantic_prior']['prompts']); vals=[float((j+k)%7)/10 for k in range(len(labs))];style=float((j%5)/10)
  else:
   sims=f@tf.T;vals=[float(x) for x in sims[:-1]];style=float(sims[-1])
  pairs=sorted(zip(keys,vals),key=lambda x:x[1],reverse=True);r['semantic_prior']={'score_semantics':'CLIP_COSINE_NOT_PROBABILITY','top_label':pairs[0][0] if pairs else None,'top_score':pairs[0][1] if pairs else None,'runner_up_label':pairs[1][0] if len(pairs)>1 else None,'margin':(pairs[0][1]-pairs[1][1]) if len(pairs)>1 else None,'scores':dict(zip(keys,vals)),'style_similarity':style}
  del r['mask'];del r['orig_index']
 # overlay preview
 over=np.asarray(im).copy();draw=ImageDraw.Draw(Image.fromarray(over))
 # make deterministic contour overlay directly in PIL
 prev=Image.fromarray(over);d=ImageDraw.Draw(prev)
 for j,r in enumerate(rec):
  m=np.array(Image.open(out/r['mask_asset']))>0
  # contour pixels via shifts
  bd=m & ~(np.roll(m,1,0)&np.roll(m,-1,0)&np.roll(m,1,1)&np.roll(m,-1,1))
  yy,xx=np.where(bd); col=((37*j+73)%255,(91*j+41)%255,(151*j+19)%255)
  pa=np.array(prev);pa[yy,xx]=col;prev=Image.fromarray(pa);d=ImageDraw.Draw(prev);x0,y0,x1,y1=r['bbox'];d.text((x0,y0),str(j),fill=(255,255,255),stroke_width=2,stroke_fill=(0,0,0))
 pp=out/'previews'/f'{image_id}_foundation_masks.png';prev.save(pp)
 return {'schema_version':'0.8a2.0','image_id':image_id,'source_path':str(src),'source_sha256':actual,'image_size':[w,h],'foundation_model':cfg['foundation_mask']['model'] if mode!='mock' else 'MOCK_TEST_ONLY','foundation_mask_truth_claim':False,'groups':rec,'preview_asset':str(pp.relative_to(out)).replace('\\','/')}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--manifest',required=True);ap.add_argument('--config',required=True);ap.add_argument('--out-dir',required=True);ap.add_argument('--mode',choices=['real','mock'],default='real');a=ap.parse_args()
 cfg=json.loads(Path(a.config).read_text(encoding='utf-8'));man=json.loads(Path(a.manifest).read_text(encoding='utf-8'));out=Path(a.out_dir);out.mkdir(parents=True,exist_ok=True)
 for d in ['foundation_masks','group_crops','previews','per_image']:(out/d).mkdir(exist_ok=True)
 models=real_models(cfg) if a.mode=='real' else None
 results=[]
 for n,item in enumerate(man['items'],1):
  p=out/'per_image'/f"{item['image_id']}.foundation.json"
  try:
   if p.exists():
    old=json.loads(p.read_text(encoding='utf-8'))
    if old.get('source_sha256')==item.get('source_sha256') and old.get('foundation_model')==(cfg['foundation_mask']['model'] if a.mode=='real' else 'MOCK_TEST_ONLY'):
     results.append(old);print(f'[{n}/{len(man["items"])}] RESUME {item["image_id"]}',flush=True);continue
   print(f'[{n}/{len(man["items"])}] FOUNDATION {item["image_id"]}',flush=True)
   doc=process(item,cfg,out,a.mode,models);p.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');results.append(doc)
  except Exception as e:
   print(f'ERROR {item["image_id"]}: {e}',flush=True);results.append({'image_id':item['image_id'],'error':repr(e)})
 (out/'foundation_worker_summary.json').write_text(json.dumps({'schema_version':'0.8a2.0','mode':a.mode,'results':results},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'ok':all('error' not in r for r in results),'processed':sum('error' not in r for r in results),'total':len(results)}),flush=True)
if __name__=='__main__':main()
