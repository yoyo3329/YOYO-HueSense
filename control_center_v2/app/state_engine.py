from __future__ import annotations
from pathlib import Path
import hashlib, sys
ROOT=Path(__file__).resolve().parent.parent
RUNNING_SOURCE_SHA256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
sys.path.insert(0,str(ROOT))
from app.common import read_json, write_json, sha256_file
from app.history import list_runs

def _main_run(runs, stage_id):
    for r in runs:
        m=r["manifest"]
        if m.get("stage")!=stage_id:
            continue
        if m.get("affects_stage_state") is True:
            return r
        if m.get("run_mode")=="IMPORTED" and not m.get("mock_only"):
            return r
    return None

def _dataset_authority():
    paths=read_json(ROOT/"config"/"project_paths.json",{}) or {}
    p=Path(paths.get("dataset_manifest") or "")
    ds=read_json(p,{}) if p.is_file() else {}
    return {
        "path":str(p) if str(p) else None,
        "dataset_id":ds.get("dataset_id"),
        "reference_count":ds.get("reference_count"),
        "status":ds.get("status"),
        "manifest_sha256":sha256_file(p) if p.is_file() else None,
    }

def _taxonomy_authority(dataset_path):
    if not dataset_path:
        return {}
    p=Path(dataset_path).parent/"human_substyle_audit_v1.json"
    x=read_json(p,{}) if p.is_file() else {}
    if not x:
        return {}
    return {
        "status":x.get("status"),
        "taxonomy_version":x.get("taxonomy_version"),
        "classified_count":x.get("classified_count"),
        "hold_review_count":x.get("hold_review_count"),
        "active_reference_count":x.get("active_reference_count"),
        "coverage_percent":x.get("coverage_percent"),
        "audit_sha256":sha256_file(p) if p.is_file() else None,
        "path":str(p),
    }

def _effective(manifest, recorded_status, current):
    d={
        "recorded_status":recorded_status,
        "historical_status":manifest.get("historical_status") or recorded_status,
        "current_applicability":"CURRENT",
        "applicability_reason":None,
    }
    if recorded_status=="STALE":
        d["current_applicability"]=manifest.get("current_applicability") or "STALE_BY_DATASET_CHANGE"
        d["applicability_reason"]=manifest.get("applicability_reason")
        return "STALE",d
    if recorded_status!="PASS":
        return recorded_status,d
    run_sha=manifest.get("dataset_manifest_sha256")
    run_id=manifest.get("dataset_id")
    cur_sha=current.get("manifest_sha256")
    cur_id=current.get("dataset_id")
    if not run_sha or not run_id:
        d["current_applicability"]="STALE_UNVERIFIED_DATASET_AUTHORITY"
        d["applicability_reason"]="PASS_RUN_MISSING_DATASET_FINGERPRINT"
        return "STALE",d
    if cur_sha and run_sha!=cur_sha:
        d["current_applicability"]="STALE_BY_DATASET_CHANGE"
        d["applicability_reason"]="DATASET_MANIFEST_SHA256_MISMATCH"
        return "STALE",d
    if cur_id and run_id!=cur_id:
        d["current_applicability"]="STALE_BY_DATASET_CHANGE"
        d["applicability_reason"]="DATASET_ID_MISMATCH"
        return "STALE",d
    return "PASS",d

def build_state(control_root):
    registry=read_json(ROOT/"config"/"stage_registry.json",{})
    runs=list_runs(Path(control_root)/"runs")
    current_dataset=_dataset_authority()
    rows=[]; upstream_pass=True; current=None
    for st in sorted(registry.get("stages",[]),key=lambda x:(x["phase"],x["order"])):
        r=_main_run(runs,st["id"])
        if r:
            manifest=r["manifest"]
            status,app=_effective(manifest,manifest.get("status","NOT_STARTED"),current_dataset)
            detail={"run_id":manifest.get("run_id"),"summary":r.get("summary",{}),"manifest":manifest,**app}
        else:
            status="READY" if upstream_pass else "NOT_STARTED"
            detail={"recorded_status":None,"historical_status":None,"current_applicability":"NO_CURRENT_RUN","applicability_reason":None}
        if status!="PASS":
            upstream_pass=False
            if current is None:
                current=st["id"]
        rows.append({**st,"status":status,**detail})
    total=len(rows)
    passed=sum(1 for x in rows if x["status"]=="PASS")
    stale=sum(1 for x in rows if x["status"]=="STALE")
    historical_passed=sum(1 for x in rows if x.get("historical_status")=="PASS")
    cur=next((x for x in rows if x["id"]==current),None)
    state={
        "schema":"YOYO_CONTROL_CENTER_STATE_V4",
        "overall":{"passed":passed,"stale":stale,"historical_passed":historical_passed,"total":total,
                   "progress_percent":round(100*passed/total,1) if total else 0},
        "current_phase":cur["phase"] if cur else None,
        "current_stage":cur["id"] if cur else None,
        "current_stage_name":cur["name"] if cur else None,
        "formal_claim_allowed":False,
        "project_mode":"DEV",
        "dataset_authority":current_dataset,
        "taxonomy_authority":_taxonomy_authority(current_dataset.get("path")),
        "stages":rows,
        "run_count":len(runs),
        "next_allowed_stage":cur["id"] if cur else None
    }
    write_json(Path(control_root)/"state"/"project_state.json",state)
    return state
