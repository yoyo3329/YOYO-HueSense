from PIL import Image,ImageDraw
import tempfile,os
from transformers import pipeline
print('A2 SAM2 smoke: loading facebook/sam2.1-hiera-tiny ...',flush=True)
pipe=pipeline('mask-generation',model='facebook/sam2.1-hiera-tiny',device=-1)
im=Image.new('RGB',(96,64),'white');d=ImageDraw.Draw(im);d.rectangle([10,10,45,55],fill='black');d.ellipse([55,12,90,48],fill=(220,50,140))
out=pipe(im,points_per_batch=8,points_per_crop=4,crops_n_layers=0,pred_iou_thresh=.5,stability_score_thresh=.5)
print('SAM2_SMOKE_MASKS',len(out.get('masks',[])))
if len(out.get('masks',[]))<1: raise SystemExit('SAM2 smoke produced no masks')
print('SAM2_SMOKE_OK')
