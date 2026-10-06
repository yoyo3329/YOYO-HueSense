from __future__ import annotations
from pathlib import Path
import re
from .common import read_json, write_json, now_iso

def _arr(v):
    if v is None: return []
    if isinstance(v,list): return [str(x) for x in v if str(x).strip()]
    if isinstance(v,str):
        parts=[x.strip(" •-\t") for x in re.split(r"[\r\n]+",v) if x.strip()]
        return parts or [v]
    return [str(v)]

def _stage_meta(registry, stage_id):
    return next((x for x in (registry.get("stages") or []) if x.get("id")==stage_id),{}) or {}

def _next_meta(registry, stage_id):
    st=_stage_meta(registry,stage_id)
    nxt=st.get("next")
    return _stage_meta(registry,nxt) if nxt else {}

def normalize_summary(raw:dict, manifest:dict, gate:dict, registry:dict):
    raw=raw or {}; manifest=manifest or {}; gate=gate or {}
    stage_id=manifest.get("stage")
    st=_stage_meta(registry,stage_id)
    nxt=_next_meta(registry,stage_id)

    purpose=raw.get("purpose") or raw.get("why") or st.get("purpose") or "此 Run 尚未提供目的說明。"
    process=_arr(raw.get("process"))
    if not process:
        process=[
            f"載入 Stage：{st.get('name') or stage_id or 'Unknown'}",
            "讀取本次 runner / dataset / config",
            "執行 Stage",
            "讀取 Gate / Manifest / Result",
            "匯入 Control Center Run History"
        ]
    actions=_arr(raw.get("actions"))
    if not actions:
        action_source=raw.get("what") or raw.get("input")
        actions=_arr(action_source) or ["依 run_manifest.json 執行本次 Stage。"]

    result_summary=raw.get("result_summary") or raw.get("result") or raw.get("plain_status")
    if not result_summary:
        result_summary=str(gate.get("FINAL") or gate.get("status") or manifest.get("status") or "UNKNOWN")

    improvements=_arr(raw.get("improvements"))
    if not improvements:
        improvements=_arr(raw.get("difference"))
    if not improvements:
        improvements=["本次尚未記錄額外改進事項。"]

    ng=raw.get("next_goal")
    if not isinstance(ng,dict):
        next_stage=(nxt.get("id") or st.get("next"))
        ng={
            "stage":next_stage,
            "objective":raw.get("next") or (nxt.get("purpose") if nxt else "目前沒有下一個 Main Stage。"),
            "pass_conditions":[]
        }
    else:
        ng={
            "stage":ng.get("stage") or (nxt.get("id") or st.get("next")),
            "objective":ng.get("objective") or raw.get("next") or (nxt.get("purpose") if nxt else ""),
            "pass_conditions":_arr(ng.get("pass_conditions"))
        }

    return {
        "schema":"YOYO_RUN_SUMMARY_V2",
        "purpose":str(purpose),
        "process":process,
        "actions":actions,
        "result_summary":str(result_summary),
        "improvements":improvements,
        "next_goal":ng,
        "legacy":{
            "what":raw.get("what"),
            "why":raw.get("why"),
            "input":raw.get("input"),
            "result":raw.get("result"),
            "difference":raw.get("difference"),
            "next":raw.get("next")
        }
    }

def build_progress_journal(manifest, summary, gate, registry, progress_before, progress_after):
    st=_stage_meta(registry,manifest.get("stage"))
    return {
        "schema":"YOYO_PROGRESS_JOURNAL_V1",
        "created_at":now_iso(),
        "run_id":manifest.get("run_id"),
        "phase":manifest.get("phase") or st.get("phase"),
        "phase_name":next((p.get("name") for p in (registry.get("phases") or []) if p.get("id")==st.get("phase")),None),
        "stage":manifest.get("stage"),
        "stage_name":st.get("name") or manifest.get("stage"),
        "status":manifest.get("status"),
        "formal_claim_allowed":bool(manifest.get("formal_claim_allowed",False)),
        "purpose":summary.get("purpose"),
        "process":summary.get("process") or [],
        "actions":summary.get("actions") or [],
        "result_summary":summary.get("result_summary"),
        "improvements":summary.get("improvements") or [],
        "next_goal":summary.get("next_goal") or {},
        "progress_before":progress_before or {},
        "progress_after":progress_after or {},
        "gate_name":manifest.get("gate_name"),
        "mainline_progressed":bool(manifest.get("affects_stage_state"))
    }

def timeline_entries(runs, registry):
    rows=[]
    stages={x.get("id"):x for x in (registry.get("stages") or [])}
    for r in reversed(runs):  # chronological
        m=r.get("manifest") or {}; s=r.get("summary") or {}
        if m.get("mock_only") or m.get("run_mode") in ("MOCK","UTILITY"):
            continue
        if m.get("status")!="PASS":
            continue
        if not (m.get("affects_stage_state") or m.get("run_mode")=="IMPORTED"):
            continue
        st=stages.get(m.get("stage"),{})
        rows.append({
            "run_id":m.get("run_id"),
            "date":(m.get("finished_at") or m.get("started_at") or "")[:10],
            "phase":m.get("phase") or st.get("phase"),
            "stage":m.get("stage"),
            "stage_name":st.get("name") or m.get("stage"),
            "status":m.get("status"),
            "headline":s.get("result_summary") or s.get("result") or s.get("plain_status") or st.get("purpose")
        })
    return rows
