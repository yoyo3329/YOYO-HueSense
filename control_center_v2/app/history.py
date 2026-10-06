from __future__ import annotations
from pathlib import Path
from .common import read_json

def list_runs(root):
    runs=[]
    p=Path(root)
    if not p.is_dir():
        return runs
    for d in p.iterdir():
        if not d.is_dir(): continue
        m=read_json(d/"run_manifest.json")
        s=read_json(d/"summary.json")
        if m:
            runs.append({"dir":str(d),"manifest":m,"summary":s or {}})
    runs.sort(key=lambda x:x["manifest"].get("finished_at") or x["manifest"].get("started_at") or "",reverse=True)
    return runs

def previous_same_stage(runs, stage_id, exclude_run_id=None, include_mock=False):
    for r in runs:
        m=r["manifest"]
        if m.get("run_id")==exclude_run_id: continue
        if m.get("stage")!=stage_id: continue
        if not include_mock and m.get("mock_only"): continue
        return r
    return None

def latest_research_run(runs):
    for r in runs:
        m=r["manifest"]
        if not m.get("mock_only") and m.get("run_mode")!="MOCK":
            return r
    return None

def latest_control_test(runs):
    for r in runs:
        m=r["manifest"]
        if m.get("mock_only") or m.get("run_mode")=="MOCK":
            return r
    return None
