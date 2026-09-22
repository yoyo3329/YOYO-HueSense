from pathlib import Path
import json, subprocess, sys
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parents[1]
tmp=root/"tests"/"_tmp_a1"; tmp.mkdir(exist_ok=True)
img=tmp/"synthetic.png"
im=Image.new("RGB",(240,160),"#E8E8E8");d=ImageDraw.Draw(im)
d.rectangle([20,20,95,140],fill="#111111"); d.rectangle([120,30,220,75],fill="#E44AA0"); d.ellipse([145,90,210,145],fill="#5AA8F0")
im.save(img)
manifest=tmp/"batch.json";manifest.write_text(json.dumps({"items":[{"image_id":"synthetic","image":str(img)}]}))
cp=subprocess.run([sys.executable,str(root/"python"/"cv_worker_a1.py"),"--batch-manifest",str(manifest),"--out-dir",str(tmp),"--segments","18"],capture_output=True,text=True)
print(cp.stdout);print(cp.stderr)
if cp.returncode:raise SystemExit(cp.returncode)
doc=json.loads((tmp/"synthetic.atomic.json").read_text())
assert len(doc["atomic_regions"])>0
assert all(r["immutable"] for r in doc["atomic_regions"])
assert len(doc["relationship_edges"])>0
assert all("scale_stability_score" in r["diagnostics"] for r in doc["atomic_regions"])
assert all("perturbation_stability_score" in r["diagnostics"] for r in doc["atomic_regions"])
assert all(not e["destructive_merge_executed"] for e in doc["relationship_edges"])

means={(round(r["mean_lab"]["L"],6),round(r["mean_lab"]["a"],6),round(r["mean_lab"]["b"],6)) for r in doc["atomic_regions"]}
assert len(means)>1, "region-local mean_lab collapsed to a single stale value"
deltas=[e["evidence"]["oklab_delta"] for e in doc["relationship_edges"]]
assert max(deltas)>0.01, "relationship OKLab deltas unexpectedly all zero"
impacts=[e["evidence"]["palette_impact_score"] for e in doc["relationship_edges"]]
assert max(impacts)>0, "palette impact unexpectedly all zero"

print("PASS synthetic atomic/stability/relationship worker + region-local color regression")
