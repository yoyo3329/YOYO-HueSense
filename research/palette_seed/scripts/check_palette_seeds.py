#!/usr/bin/env python3
"""Offline reproducible validation. No Docker required."""
from import_palette_seeds import validate
from collections import Counter
import hashlib, json
d=validate()
source_counts=Counter(p['source'] for p in d['palettes'])
families=Counter(p['family'] for p in d['palettes'])
unique=len(set(h for p in d['palettes'] for h in p['colors']))
assert source_counts=={'colorbrewer':35,'carto':28},source_counts
assert unique==291,unique
assert all(len(p['colors'])==5 for p in d['palettes'])
print(json.dumps({'palette_count':len(d['palettes']),'swatches':5*len(d['palettes']),'unique_hex':unique,'by_source':dict(source_counts),'by_family':dict(families),'valid':True},indent=2))
