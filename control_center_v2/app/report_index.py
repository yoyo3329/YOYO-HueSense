from __future__ import annotations
from pathlib import Path
from .common import read_json
from .history import list_runs
from .progress_journal import timeline_entries

def list_reports(paths):
    root=Path(paths.get("result_reports_root",""))
    out=[]
    if not root.is_dir(): return out
    for d in root.iterdir():
        if not d.is_dir(): continue
        m=read_json(d/"report_manifest.json",{})
        if m: out.append(m)
    out.sort(key=lambda x:x.get("created_at",""),reverse=True)
    return out

def build_timeline(control_root, registry):
    return timeline_entries(list_runs(Path(control_root)/"runs"),registry)
