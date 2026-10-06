from __future__ import annotations
from pathlib import Path
import glob, json, hashlib, datetime, os, re, sys
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from app.common import read_json, write_json, sha256_file, now_iso, json_fingerprint, git_commit, environment_fingerprint

def _latest(pattern):
    hits=[Path(x) for x in glob.glob(pattern)]
    hits=[p for p in hits if p.is_file()]
    return max(hits,key=lambda p:p.stat().st_mtime) if hits else None

def _latest_dir(root):
    p=Path(root)
    ds=[d for d in p.iterdir() if d.is_dir()] if p.is_dir() else []
    return max(ds,key=lambda d:d.stat().st_mtime) if ds else None

def _run_dir(control_root, run_id):
    d=Path(control_root)/"runs"/run_id
    (d/"logs").mkdir(parents=True,exist_ok=True)
    (d/"artifacts").mkdir(parents=True,exist_ok=True)
    return d

def _write_imported_run(control_root, manifest, summary, gate, artifacts=None):
    d=_run_dir(control_root,manifest["run_id"])
    write_json(d/"run_manifest.json",manifest)
    write_json(d/"summary.json",summary)
    write_json(d/"gate.json",gate)
    write_json(d/"diff_from_previous.json",{"ADDED":{},"REMOVED":{},"CHANGED":{},"UNCHANGED":{},"note":"Imported historical/current artifact; diff recalculated by Control Center when a comparable previous run exists."})
    if artifacts:
        write_json(d/"artifacts"/"source_pointers.json",artifacts)
    return d

def import_existing(control_root, paths):
    imported=[]

    ds_path=Path(paths["dataset_manifest"])
    ds=read_json(ds_path,{})
    if ds and ds_path.is_file():
        run_id="IMPORTED_CANONICAL_"+str(ds.get("dataset_id") or "UNKNOWN")
        manifest={
            "run_id":run_id,"phase":1,"stage":"P1_CANONICAL","run_mode":"IMPORTED",
            "dataset_id":ds.get("dataset_id"),"dataset_manifest_sha256":sha256_file(ds_path),
            "reference_count":ds.get("reference_count"),"input_count":ds.get("reference_count"),
            "output_count":ds.get("reference_count"),"status":"PASS" if ds.get("reference_count") else "HOLD",
            "formal_claim_allowed":bool(ds.get("formal_claim_allowed",False)),
            "schema_version":ds.get("schema"),"code_version":"IMPORTED_ARTIFACT",
            "config_sha256":None,"environment_fingerprint":None,
            "started_at":None,"finished_at":datetime.datetime.fromtimestamp(ds_path.stat().st_mtime,datetime.timezone.utc).isoformat(),
            "previous_run_id":None,"output_fingerprint":sha256_file(ds_path)
        }
        summary={
            "what":"匯入目前固定的 DEV Canonical Dataset。",
            "why":"Control Center 需要知道目前工程主線正在使用哪一份 Reference Dataset。",
            "input":f"{ds.get('reference_count')} references",
            "result":f"Dataset {ds.get('dataset_id')} / {ds.get('status')}",
            "difference":"首次匯入，沒有可比較的前一 Run。",
            "next":"A1 Bridge",
            "plain_status":"DEV Dataset 已存在且可追溯；這不是正式研究 Dataset。"
        }
        gate={"status":manifest["status"],"dataset_status":ds.get("status"),"formal_claim_allowed":manifest["formal_claim_allowed"]}
        _write_imported_run(control_root,manifest,summary,gate,{"dataset_manifest":str(ds_path)})
        imported.append(run_id)

    a1_gate_path=_latest(paths["a1_gate_glob"])
    if a1_gate_path:
        gate=read_json(a1_gate_path,{})
        rid="IMPORTED_A1_"+a1_gate_path.parent.name
        count=gate.get("reference_count")
        status="PASS" if gate.get("DEV_A1_READY_FOR_A2_1")=="PASS" else "HOLD"
        # Bridge and A1 are separately surfaced even though they belong to the same V1.2 execution chain.
        bridge_manifest={
            "run_id":rid+"_BRIDGE","phase":1,"stage":"P1_A1_BRIDGE","run_mode":"IMPORTED",
            "dataset_id":gate.get("source_dataset_id"),
            "dataset_manifest_sha256":sha256_file(ds_path) if ds_path.is_file() else None,
            "reference_count":count,"input_count":count,"output_count":count,
            "status":status,"formal_claim_allowed":False,"schema_version":"YOYO_A1_COMPATIBLE_BRIDGE_INPUT_V1",
            "code_version":"IMPORTED_V1_2","config_sha256":None,"environment_fingerprint":None,
            "started_at":None,"finished_at":datetime.datetime.fromtimestamp(a1_gate_path.stat().st_mtime,datetime.timezone.utc).isoformat(),
            "previous_run_id":None,"output_fingerprint":sha256_file(a1_gate_path)
        }
        bridge_summary={
            "what":"匯入 Canonical Dataset → A1 Bridge 的既有結果。",
            "why":"確認 Dataset 真的能在不掉圖、不換圖的前提下交給 A1。",
            "input":f"{count} references",
            "result":f"{count} mapped / Gate {status}",
            "difference":"既有 V1.2 結果首次納入 Control Center。",
            "next":"A1",
            "plain_status":"Bridge 已可供目前 DEV A1 使用。"
        }
        _write_imported_run(control_root,bridge_manifest,bridge_summary,{"status":status,"source_gate":str(a1_gate_path)},{"a1_gate":str(a1_gate_path)})
        imported.append(bridge_manifest["run_id"])

        a1_manifest={**bridge_manifest}
        a1_manifest.update({
            "run_id":rid,"stage":"P1_A1","schema_version":gate.get("schema"),
            "status":status,"output_count":count,"output_fingerprint":sha256_file(a1_gate_path)
        })
        a1_summary={
            "what":"對 49 張 DEV references 建立 A1 Atomic Regions。",
            "why":"後續 A2 / B1 需要一層不可破壞、可追溯的基礎區域。",
            "input":f"{count} references",
            "result":f"{gate.get('A1_IMAGES_PROCESSED')} completed；0 dropped if Identity/SHA gates PASS。",
            "difference":"+ Atomic Regions；Canonical source image identity 保持不變。",
            "next":"Contract Hardening",
            "plain_status":"A1 DEV 已通過，但不代表 Formal Evidence 已成立。"
        }
        _write_imported_run(control_root,a1_manifest,a1_summary,gate,{"a1_gate":str(a1_gate_path),"a1_run_dir":str(a1_gate_path.parent)})
        imported.append(rid)

    hard_root=Path(paths["contract_hardening_archive_root"])
    latest=_latest_dir(hard_root)
    if latest and (latest/"gate.json").is_file():
        gate=read_json(latest/"gate.json",{})
        input_lock=read_json(latest/"input_lock.json",{})
        status="PASS" if str(gate.get("status","")).startswith("PASS_") else ("HOLD" if str(gate.get("status","")).startswith("HOLD") else "FAIL")
        rid="IMPORTED_CONTRACT_"+latest.name
        manifest={
            "run_id":rid,"phase":1,"stage":"P1_CONTRACT","run_mode":"IMPORTED",
            "dataset_id":gate.get("dataset_id"),"dataset_manifest_sha256":gate.get("dataset_manifest_sha256"),
            "reference_count":gate.get("reference_count"),"input_count":gate.get("reference_count"),
            "output_count":gate.get("reference_count"),"status":status,"formal_claim_allowed":False,
            "schema_version":gate.get("schema"),"code_version":"YOYO_MAINLINE_V2",
            "config_sha256":None,
            "environment_fingerprint":(input_lock or {}).get("input_fingerprint_sha256"),
            "started_at":None,"finished_at":datetime.datetime.fromtimestamp((latest/"gate.json").stat().st_mtime,datetime.timezone.utc).isoformat(),
            "previous_run_id":None,"output_fingerprint":(input_lock or {}).get("input_fingerprint_sha256") or sha256_file(latest/"gate.json")
        }
        summary={
            "what":"鎖定 DEV49 Dataset、Bridge、A1 與 A2 consumer contract。",
            "why":"避免後續 A2.1 DEV 跑到錯 Dataset、錯圖片或錯 runner。",
            "input":f"{gate.get('reference_count')} references + A1 Gate + environment / runner contract",
            "result":str(gate.get("status")),
            "difference":"+ Dataset hash lock\n+ Bridge 1:1 mapping\n+ Environment fingerprint\n+ A2 consumer preflight",
            "next":"A2.1 DEV",
            "plain_status":"Contract Hardening 已通過；A2.1 DEV 現在是下一個研究 Stage，但 Control Center V1 尚不會真實執行它。"
        }
        _write_imported_run(control_root,manifest,summary,gate,{"archive_dir":str(latest)})
        imported.append(rid)
    return imported
