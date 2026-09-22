from pathlib import Path
from PIL import Image,ImageDraw
import json,subprocess,sys,shutil,os
root=Path(__file__).resolve().parents[1];tmp=root/'tests'/'_tmp_a21'
if tmp.exists():shutil.rmtree(tmp)
(tmp/'a1'/'masks').mkdir(parents=True);(tmp/'run').mkdir(parents=True)
img=Image.new('RGB',(120,80),'white');d=ImageDraw.Draw(img);d.rectangle([5,10,48,70],fill='black');d.ellipse([70,10,112,52],fill=(220,50,140));src=tmp/'src.png';img.save(src)
# two immutable atomic halves
import numpy as np
for i,(x0,x1) in enumerate([(0,60),(60,120)]):
 m=np.zeros((80,120),dtype=np.uint8);m[:,x0:x1]=255;Image.fromarray(m).save(tmp/'a1'/'masks'/f'r{i}.png')
regs=[]
for i in range(2):regs.append({'region_id':f'img:r0{i}','area_ratio':.5,'mean_lab':{'L':.5,'a':0,'b':0},'saliency_proxy':.5,'edge_density':.1,'lightness_spread_p10_p90':.2,'mask_asset':f'masks/r{i}.png','diagnostics':{'color_homogeneity_score':.5,'bimodal_color_score':.4,'flags':['REGION_BACKGROUND_DOMINATED_HIGH_CONTRAST_MIXTURE'] if i==0 else []}})
obs={'schema_version':'0.8a1.1','images':[{'image_id':'img','analysis_size':[120,80],'source_path':str(src),'source_sha256':None,'source_image_asset':'source.png','region_preview_asset':'preview.png','atomic_regions':regs}]}
(tmp/'a1'/'atomic_region_observations.json').write_text(json.dumps(obs));Image.open(src).save(tmp/'a1'/'source.png');Image.open(src).save(tmp/'a1'/'preview.png')
rel={'images':[{'image_id':'img','edges':[{'edge_id':'e','source_region_id':'img:r00','target_region_id':'img:r01','evidence':{'oklab_delta':.2,'color_similarity_score':.3,'boundary_mean':.2,'boundary_p90':.3,'boundary_strong_support_ratio':.4,'texture_similarity_score':.5,'scale_stability_agreement_score':.8,'perturbation_stability_agreement_score':.9,'palette_impact_score':.2},'contradictions':['HIGH_PALETTE_IMPACT'],'action':'LINK_SIMILAR_COLOR_STRONG_GROUPING_CANDIDATE'}]}]}
(tmp/'a1'/'region_relationship_graph.json').write_text(json.dumps(rel));(tmp/'a1'/'run_manifest.json').write_text(json.dumps({'version':'0.8a1.1'}))
manifest={'items':[{'image_id':'img','source_path':str(src),'source_sha256':None,'input_source_status':'TEST'}]};(tmp/'run'/'source_manifest.json').write_text(json.dumps(manifest))
cfg=root/'config'/'stylecolor_v0_8a2_1_clean_repro.config.json'
cp=subprocess.run([sys.executable,str(root/'python'/'a2_foundation_worker_clean.py'),'--manifest',str(tmp/'run'/'source_manifest.json'),'--config',str(cfg),'--out-dir',str(tmp/'run'),'--mode','mock','--run-fingerprint','TEST'],capture_output=True,text=True);print(cp.stdout);print(cp.stderr);assert cp.returncode==0
cp=subprocess.run([sys.executable,str(root/'python'/'map_atomic_foundation.py'),'--a1-run',str(tmp/'a1'),'--a2-run',str(tmp/'run')],capture_output=True,text=True);print(cp.stdout);print(cp.stderr);assert cp.returncode==0
cp=subprocess.run(['node',str(root/'node'/'assemble_a2.js'),str(tmp/'a1'),str(tmp/'run'),str(cfg)],capture_output=True,text=True);print(cp.stdout);print(cp.stderr);assert cp.returncode==0
mp=json.loads((tmp/'run'/'atomic_foundation_overlap_raw.json').read_text());assert mp['forced_primary_ownership'] is False
hy=json.loads((tmp/'run'/'perceptual_inference_hypotheses.json').read_text());atoms=hy['images'][0]['atomic_split_keep_unknown_hypotheses'];groups=hy['images'][0]['mask_group_keep_unknown_hypotheses'];assert any('SPLIT' in x['candidate_actions'] for x in atoms);assert any('GROUP' in x['candidate_actions'] for x in groups);assert all(x['resolution_state']=='UNKNOWN' for x in atoms+groups)
pr=json.loads((tmp/'run'/'a1_observations_projection.json').read_text());e=pr['images'][0]['relationships'][0];assert 'action' not in e and e['a1_action_ignored'] is True and e['decision_risk']['palette_impact_score']==.2 and 'HIGH_PALETTE_IMPACT' not in e['contradictions']
g=json.loads((tmp/'run'/'a2_relationship_multigraph.json').read_text());assert g['no_generic_grouping_edge'] is True
print('PASS synthetic SPLIT/GROUP/KEEP/UNKNOWN + A1 authority isolation + topology')
