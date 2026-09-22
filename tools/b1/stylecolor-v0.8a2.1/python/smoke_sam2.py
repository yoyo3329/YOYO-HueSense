#!/usr/bin/env python3
from PIL import Image,ImageDraw
from pathlib import Path
import argparse,json,math,numpy as np
from transformers import pipeline
ap=argparse.ArgumentParser();ap.add_argument('--model-lock',required=True);a=ap.parse_args();lock=json.loads(Path(a.model_lock).read_text(encoding='utf-8'))
print('A2.1 SAM2 smoke: loading pinned snapshot',lock['resolved_revision'],flush=True)
pipe=pipeline('mask-generation',model=lock['snapshot_path'],device=-1)
im=Image.new('RGB',(256,192),'white');d=ImageDraw.Draw(im);d.rectangle([20,25,100,165],fill='black');d.ellipse([145,40,230,125],fill=(220,50,140));d.line([135,150,235,170],fill=(40,90,220),width=5)
out=pipe(im,points_per_batch=8,points_per_crop=8,crops_n_layers=0,pred_iou_thresh=.5,stability_score_thresh=.5)
masks=out.get('masks',[]);scores=out.get('scores',[]);areas=[]
for m in masks:
    if hasattr(m,'cpu'):m=m.cpu().numpy()
    elif hasattr(m,'convert'):m=np.array(m)
    m=np.asarray(m).astype(bool);areas.append(float(m.mean()))
print('SAM2_SMOKE_MASKS',len(masks));print('SAM2_SMOKE_AREAS',areas[:20])
if len(masks)<2:raise SystemExit('SAM2 smoke catastrophic: fewer than 2 masks on known-structure fixture')
if not any(.02<a<.90 for a in areas):raise SystemExit('SAM2 smoke catastrophic: no nontrivial mid-sized mask')
if areas and all(a>.95 for a in areas):raise SystemExit('SAM2 smoke catastrophic: full-image-only mask collapse')
if any(not math.isfinite(float(x)) for x in scores):raise SystemExit('SAM2 smoke catastrophic: non-finite mask score')
print('SAM2_SMOKE_KNOWN_STRUCTURE_OK')
