#!/usr/bin/env python3
"""Optional local-only import preview for nice-color-palettes JSON.
Never merges into CORE baseline or commits third-party palette data.
Use a locally obtained source file after checking third-party palette license.
"""
import argparse,json,hashlib,re,csv
from pathlib import Path
a=argparse.ArgumentParser();a.add_argument('json_file',type=Path);a.add_argument('--output',type=Path,default=Path('nice_palettes_PENDING_REVIEW.csv'))
args=a.parse_args()
rows=json.loads(args.json_file.read_text(encoding='utf-8'))
if not isinstance(rows,list):raise ValueError('Top level must be list')
seen=set();out=[]
for i,p in enumerate(rows):
    if not isinstance(p,list) or len(p)!=5:continue
    swatches=[str(h).upper() for h in p]
    if not all(re.fullmatch('#[0-9A-F]{6}',h) for h in swatches):continue
    key=tuple(swatches)
    if key in seen:continue
    seen.add(key)
    out.append({'source':'nice-color-palettes','source_index':i,'colors_json':json.dumps(swatches),'status':'PENDING_SOURCE_LICENSE_REVIEW','source_sha256':hashlib.sha256(args.json_file.read_bytes()).hexdigest()})
with args.output.open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=['source','source_index','colors_json','status','source_sha256']);w.writeheader();w.writerows(out)
print('Pending-only rows:',len(out),'saved to',args.output)
