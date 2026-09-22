#!/usr/bin/env python3
import argparse,json,sys
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--pre',required=True);ap.add_argument('--post',required=True);ap.add_argument('--out',required=True);a=ap.parse_args()
pre=json.loads(Path(a.pre).read_text());post=json.loads(Path(a.post).read_text())
keys=['actual','torchvision_declared_torch_specifiers','torch_torchvision_requirement_satisfied','pip_freeze_sha256','python_executable']
diff={k:{'pre':pre.get(k),'post':post.get(k)} for k in keys if pre.get(k)!=post.get(k)}
ok=pre.get('cleanly_certified') is True and post.get('cleanly_certified') is True and not diff
d={'schema_version':'0.8a2.1-clean-repro','pre_clean':pre.get('cleanly_certified'),'post_clean':post.get('cleanly_certified'),'environment_immutable_during_inference':not diff,'differences':diff,'certified':ok}
Path(a.out).write_text(json.dumps(d,indent=2)+'\n')
print('ENV_IMMUTABILITY_'+('PASS' if ok else 'FAIL'))
if diff: print(json.dumps(diff,indent=2))
sys.exit(0 if ok else 33)
