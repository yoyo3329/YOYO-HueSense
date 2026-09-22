from pathlib import Path
import json,sys,subprocess,hashlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1];tmp=root/'tests'/'_tmp_a2';import shutil
if tmp.exists():shutil.rmtree(tmp)
tmp.mkdir();(tmp/'foundation_masks').mkdir();(tmp/'group_crops').mkdir();(tmp/'previews').mkdir();(tmp/'per_image').mkdir()
# Two atomic masks and two foundation masks for deterministic mapping
im=Image.new('RGB',(100,60),'white');arr=np.array(im);arr[:,0:50]=[20,20,20];arr[:,50:]=[220,20,120];src=tmp/'img.png';Image.fromarray(arr).save(src)
a1=tmp/'a1';(a1/'masks').mkdir(parents=True)
m0=np.zeros((60,100),np.uint8);m0[:,:50]=255;m1=np.zeros((60,100),np.uint8);m1[:,50:]=255;Image.fromarray(m0).save(a1/'masks/i_r00.png');Image.fromarray(m1).save(a1/'masks/i_r01.png')
sha=hashlib.sha256(src.read_bytes()).hexdigest();obs={'images':[{'image_id':'i','analysis_size':[100,60],'source_path':str(src),'source_sha256':sha,'source_image_asset':'x.jpg','atomic_regions':[{'region_id':'i:r00','mask_asset':'masks/i_r00.png','area_ratio':.5,'mean_lab':{'L':.2,'a':0,'b':0},'saliency_proxy':.5,'edge_density':.1,'diagnostics':{},'clip_input_coherence_score':.8},{'region_id':'i:r01','mask_asset':'masks/i_r01.png','area_ratio':.5,'mean_lab':{'L':.6,'a':.2,'b':0},'saliency_proxy':.5,'edge_density':.1,'diagnostics':{},'clip_input_coherence_score':.8}]}]};(a1/'atomic_region_observations.json').write_text(json.dumps(obs));(a1/'run_manifest.json').write_text('{}');(a1/'region_relationship_graph.json').write_text(json.dumps({'images':[{'image_id':'i','edges':[]}]}))
# use worker mock to generate groups; then overwrite masks to exact halves to validate mapper invariant to atomic order
man={'items':[{'image_id':'i','source_path':str(src),'source_sha256':sha}]};(tmp/'man.json').write_text(json.dumps(man));cfg=root/'config/stylecolor_v0_8a2.config.json'
cp=subprocess.run([sys.executable,str(root/'python/a2_foundation_worker.py'),'--manifest',str(tmp/'man.json'),'--config',str(cfg),'--out-dir',str(tmp),'--mode','mock'],capture_output=True,text=True);print(cp.stdout);assert cp.returncode==0
# mapper must produce deterministic argmax membership; repeat with reversed atomic ordering
subprocess.check_call([sys.executable,str(root/'python/map_atomic_foundation.py'),'--a1-run',str(a1),'--a2-run',str(tmp)]);first=json.loads((tmp/'atomic_foundation_overlap_raw.json').read_text())
obs['images'][0]['atomic_regions'].reverse();(a1/'atomic_region_observations.json').write_text(json.dumps(obs));subprocess.check_call([sys.executable,str(root/'python/map_atomic_foundation.py'),'--a1-run',str(a1),'--a2-run',str(tmp)]);second=json.loads((tmp/'atomic_foundation_overlap_raw.json').read_text())
f={x['region_id']:x['primary_group_id'] for x in first['images'][0]['atomic_regions']};s={x['region_id']:x['primary_group_id'] for x in second['images'][0]['atomic_regions']};assert f==s
print('PASS region permutation invariance for atomic-to-foundation mapping')
