from pathlib import Path
import tempfile, json, subprocess, sys
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as td:
    td=Path(td); img=Image.new('RGB',(240,160),'#777777');d=ImageDraw.Draw(img);d.rectangle((10,10,110,150),fill='#D85BAA');d.rectangle((125,20,230,140),fill='#202530');p=td/'synthetic.png';img.save(p)
    cmd=[sys.executable,str(root/'python'/'cv_worker.py'),'--image',str(p),'--image-id','synthetic','--out-dir',str(td/'out'),'--segments','12','--max-dim','240','--palette-k','2']
    cp=subprocess.run(cmd,capture_output=True,text=True,timeout=60)
    if cp.returncode: raise SystemExit(cp.stderr)
    out=json.loads((td/'out'/'synthetic.regions.json').read_text())
    assert out['region_engine']['semantic_claim'] is False
    assert len(out['regions'])>=2
    assert all(r['clip_style_similarity'] is None for r in out['regions'])
    assert all('palette' in r and r['palette'] for r in out['regions'])
    print('PASS  Python CV worker produces deterministic region observations without semantic overclaim')
