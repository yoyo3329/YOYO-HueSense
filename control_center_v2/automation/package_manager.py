from __future__ import annotations
from pathlib import Path
import threading, time, json, shutil, hashlib, subprocess, sys, os, re, datetime, traceback
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.common import read_json, write_json, sha256_file, now_iso, environment_fingerprint
from app.state_engine import build_state
from app.history import list_runs, previous_same_stage
from app.diff_engine import diff_manifests
from .security import PackageSecurityError, inspect_zip, safe_extract, validate_relative_inside, validate_install_destination
from .package_contract import load_manifest, validate_manifest, validate_dataset_requirement

FINAL_STATUSES={"PASS","HOLD","FAIL","REJECTED","ARCHIVED"}
ACTIVE_STATUSES={"RUNNING","INSTALLING","IMPORTING","INSPECTING"}
EXECUTABLE_STATUSES={"NEW","STAGED","VALIDATED","READY"}
PACKAGE_MANAGER_HARDENING="YOYO_PACKAGE_MANAGER_P0_AUTHORITY_HARDENED_V1"

class DatasetLineageDriftError(RuntimeError):
    pass

def _recursive_contains(obj, target):
    if isinstance(obj, dict):
        return any(_recursive_contains(v,target) for v in obj.values())
    if isinstance(obj, list):
        return any(_recursive_contains(v,target) for v in obj)
    return obj == target

def _safe_name(s):
    return re.sub(r"[^A-Za-z0-9._-]+","_",str(s))[:140]

class PackageManager:
    def __init__(self, control_root: Path):
        self.root=Path(control_root)
        self.paths=read_json(self.root/"config"/"project_paths.json",{})
        self.settings_path=self.root/"config"/"automation_settings.json"
        self.settings=read_json(self.settings_path,{})
        self.lock=threading.RLock()
        self.stop_flag=False
        self.worker=None
        self.stable={}
        self.state_path=self.root/"state"/"automation_state.json"
        self.queue_dir=self.root/"state"/"packages"
        self.queue_dir.mkdir(parents=True,exist_ok=True)
        for k in ("incoming_packages","package_staging","package_archive","pipeline_root","plugin_root","workspace_root","backup_root"):
            if self.paths.get(k): Path(self.paths[k]).mkdir(parents=True,exist_ok=True)
        self._ensure_archive_dirs()
        if not self.state_path.exists():
            write_json(self.state_path,{
                "schema":"YOYO_AUTOMATION_STATE_V1",
                "watching":self.paths.get("incoming_packages"),
                "active_package_id":None,
                "active_run_id":None,
                "live_log_tail":[],
                "progress":{},
                "last_event":"Automation initialized."
            })

    def _ensure_archive_dirs(self):
        root=Path(self.paths["package_archive"])
        for x in ("completed","hold","failed","rejected"):
            (root/x).mkdir(parents=True,exist_ok=True)

    def _load_state(self):
        return read_json(self.state_path,{}) or {}

    def _save_state(self, **updates):
        with self.lock:
            st=self._load_state()
            st.update(updates)
            st["updated_at"]=now_iso()
            write_json(self.state_path,st)

    def list_records(self):
        out=[]
        for p in self.queue_dir.glob("*.json"):
            x=read_json(p,{})
            if x: out.append(x)
        out.sort(key=lambda x:x.get("detected_at",""),reverse=True)
        return out

    def _record_path(self, package_key):
        return self.queue_dir/f"{_safe_name(package_key)}.json"

    def _save_record(self, rec):
        write_json(self._record_path(rec["package_key"]),rec)

    def refresh_settings(self):
        self.settings=read_json(self.settings_path,{}) or self.settings

    def update_settings(self, updates):
        allowed={"watch_enabled","auto_run_dev_packages","auto_run_formal_packages","auto_open_results","auto_archive_completed_zip"}
        current=read_json(self.settings_path,{}) or {}
        for k,v in updates.items():
            if k in allowed and isinstance(v,bool): current[k]=v
        write_json(self.settings_path,current)
        self.settings=current
        return current

    def _discover_new_zips(self):
        inbox=Path(self.paths["incoming_packages"])
        if not inbox.is_dir(): return
        for z in inbox.glob("*.zip"):
            try:
                stat=z.stat()
            except Exception:
                continue
            sig=(stat.st_size,stat.st_mtime_ns)
            prev=self.stable.get(str(z))
            if not prev or prev["sig"]!=sig:
                self.stable[str(z)]={"sig":sig,"count":1}
                continue
            prev["count"]+=1
            if prev["count"] < int(self.settings.get("stable_file_scans_required",2)):
                continue
            zip_sha=sha256_file(z)
            key=f"{z.stem}_{zip_sha[:12]}"
            if self._record_path(key).exists():
                continue
            rec={
                "schema":"YOYO_PACKAGE_QUEUE_RECORD_V1",
                "package_key":key,
                "zip_name":z.name,
                "zip_path":str(z),
                "zip_sha256":zip_sha,
                "status":"NEW",
                "detected_at":now_iso(),
                "events":[{"at":now_iso(),"status":"NEW","message":"New package detected."}]
            }
            self._save_record(rec)
            self._save_state(last_event=f"NEW PACKAGE DETECTED: {z.name}")

    def _event(self, rec, status, message, **extra):
        rec["status"]=status
        rec.setdefault("events",[]).append({"at":now_iso(),"status":status,"message":message})
        rec.update(extra)
        self._save_record(rec)
        self._save_state(last_event=f"{rec.get('package_id') or rec.get('zip_name')}: {message}")

    def _event_if_changed(self, rec, status, message, **extra):
        events=rec.setdefault("events",[])
        last=events[-1] if events else {}
        if rec.get("status")==status and last.get("status")==status and last.get("message")==message:
            rec.update(extra)
            rec["last_checked_at"]=now_iso()
            self._save_record(rec)
            return False
        self._event(rec,status,message,**extra)
        return True

    def _set_waiting_upstream(self, rec, reason):
        rec["waiting_reason"]=reason
        return self._event_if_changed(rec,"WAITING_UPSTREAM_GATE",reason,waiting_reason=reason)

    def _dataset_identity(self):
        dataset_path=Path(self.paths["dataset_manifest"])
        dataset=read_json(dataset_path,{}) or {}
        count=dataset.get("reference_count")
        try: count=int(count) if count is not None else None
        except Exception: count=None
        return {
            "dataset_id":dataset.get("dataset_id"),
            "reference_count":count,
            "manifest_sha256":sha256_file(dataset_path) if dataset_path.is_file() else None,
            "path":str(dataset_path),
            "observed_at":now_iso()
        }

    def _verify_pinned_dataset(self, rec, phase):
        pinned=rec.get("pinned_dataset") or {}
        current=self._dataset_identity()
        matches=bool(
            pinned and
            current.get("dataset_id")==pinned.get("dataset_id") and
            current.get("reference_count")==pinned.get("reference_count") and
            current.get("manifest_sha256")==pinned.get("manifest_sha256")
        )
        lineage=rec.setdefault("dataset_lineage",{})
        lineage[str(phase).lower()]={**current,"matches_pinned":matches}
        rec["dataset_lineage"]=lineage
        self._save_record(rec)
        if not matches:
            raise DatasetLineageDriftError(
                "HOLD_DATASET_LINEAGE_DRIFT:"+str(phase).upper()+
                f":PINNED={pinned.get('manifest_sha256')}:CURRENT={current.get('manifest_sha256')}"
            )
        return current

    def _canonical_gate_identity(self, gate):
        if not isinstance(gate,dict):
            return None,None
        # Standardized outputs use gate_id.  The current Rebase V2 schema predates
        # that field and has one explicitly mapped canonical identity field: FINAL.
        gate_id=gate.get("gate_id")
        if isinstance(gate_id,str) and gate_id:
            return gate_id,"gate_id"
        if gate.get("schema")=="YOYO_P1_REBASE_DEV_GATE_V2":
            final=gate.get("FINAL")
            return (str(final),"FINAL") if isinstance(final,str) and final else (None,"FINAL")
        return None,None

    def _success_gate_matches(self, rec, gate):
        expected=(rec.get("manifest") or {}).get("success_gate")
        actual,field=self._canonical_gate_identity(gate)
        ok=bool(expected and gate.get("schema")=="YOYO_GATE_V1" and gate.get("gate_id")==expected and gate.get("status")=="PASS" and actual==expected)
        return ok,actual,field

    def _is_executable(self, rec):
        st=rec.get("status")
        if st in FINAL_STATUSES or st in ACTIVE_STATUSES:
            return False
        if st in ("WAITING_UPSTREAM_GATE","WAITING_FORMAL_CONFIRMATION"):
            return False
        if st not in EXECUTABLE_STATUSES:
            return False
        if st=="READY":
            mode=rec.get("mode")
            if mode=="DEV" and not self.settings.get("auto_run_dev_packages",True):
                return False
            if mode=="FORMAL" and not self.settings.get("auto_run_formal_packages",False):
                return False
        return True

    def _reevaluate_waiting_records(self, records):
        for rec in sorted(records,key=lambda x:x.get("detected_at","")):
            if rec.get("status")!="WAITING_UPSTREAM_GATE":
                continue
            manifest=rec.get("manifest")
            if not isinstance(manifest,dict) or not manifest:
                self._event_if_changed(
                    rec,"REJECTED","MALFORMED_QUEUE_RECORD:LEGACY_RECORD_MISSING_MANIFEST",
                    diagnostic_code="LEGACY_RECORD_MISSING_MANIFEST",mainline_progressed=False
                )
                continue
            try:
                ready,reason=self._upstream_ready(rec)
            except Exception as e:
                msg=f"WAITING_REEVALUATION_ERROR:{type(e).__name__}:{e}"
                rec["last_checked_at"]=now_iso()
                rec["reevaluation_error"]=msg
                self._save_record(rec)
                continue
            if ready:
                self._event(rec,"VALIDATED","Upstream Gate now satisfied.")
            else:
                self._set_waiting_upstream(rec,reason)

    def _stage_and_validate(self, rec):
        zp=Path(rec["zip_path"])
        self._event(rec,"INSPECTING","Inspecting ZIP and package contract.")
        zip_info=inspect_zip(zp,self.settings)
        staging_root=Path(self.paths["package_staging"])/rec["package_key"]
        if staging_root.exists(): shutil.rmtree(staging_root)
        safe_extract(zp,staging_root)
        m=load_manifest(staging_root)
        validate_manifest(m,staging_root,Path(self.paths["repo_root"]),self.settings)
        dataset_path=Path(self.paths["dataset_manifest"])
        dataset=read_json(dataset_path,{}) or {}
        dataset_sha=sha256_file(dataset_path) if dataset_path.is_file() else None
        ds_errors=validate_dataset_requirement(m,dataset,dataset_sha)
        if ds_errors:
            raise PackageSecurityError(";".join(ds_errors))
        pinned={
            "dataset_id":dataset.get("dataset_id"),
            "reference_count":int(dataset.get("reference_count") or 0),
            "manifest_sha256":dataset_sha,
            "path":str(dataset_path),
            "pinned_at":now_iso()
        }
        rec.update({
            "package_id":m["package_id"],"package_version":m["package_version"],
            "phase":m["phase"],"stage":m["stage"],"mode":m["mode"],
            "run_mode":m.get("run_mode","FULL"),
            "formal_claim_allowed":m["formal_claim_allowed"],
            "mainline_effect":m.get("mainline_effect","STAGE_GATE"),
            "manifest":m,"staging_root":str(staging_root),
            "zip_inspection":zip_info,
            "pinned_dataset":pinned,
            "dataset_lineage":{"pinned":pinned}
        })
        self._event(rec,"STAGED","Package extracted safely into staging.")
        self._event(rec,"VALIDATED","Package manifest, Dataset and paths validated.")
        return rec

    def _upstream_ready(self, rec):
        m=rec.get("manifest")
        if not isinstance(m,dict) or not m:
            return False,"MALFORMED_QUEUE_RECORD:LEGACY_RECORD_MISSING_MANIFEST"
        if m.get("package_kind")=="CONTROL_SELFTEST":
            return True, None
        state=build_state(self.root)
        current=state.get("next_allowed_stage")
        if rec.get("stage") != current:
            return False, f"CURRENT_STAGE_IS_{current}"
        required_ds=m.get("required_dataset") or {}
        by={x["id"]:x for x in state.get("stages",[])}
        for req in m.get("required_upstream") or []:
            stage_id=req.get("stage")
            st=by.get(stage_id)
            if not st or st.get("status")!="PASS":
                return False, f"UPSTREAM_NOT_PASS:{stage_id}"
            sm=st.get("manifest") or {}
            # Current mainline dependencies must be authoritative current runs.
            if sm.get("affects_stage_state") is not True:
                return False, f"UPSTREAM_NOT_CURRENT_AUTHORITY:{stage_id}"
            expected=req.get("gate")
            actual=sm.get("gate_name")
            if expected and actual!=expected:
                return False, f"UPSTREAM_GATE_MISMATCH:{stage_id}:EXPECTED={expected}:ACTUAL={actual}"
            if required_ds.get("dataset_id") and sm.get("dataset_id")!=required_ds.get("dataset_id"):
                return False, f"UPSTREAM_DATASET_ID_MISMATCH:{stage_id}"
            if required_ds.get("manifest_sha256") and sm.get("dataset_manifest_sha256")!=required_ds.get("manifest_sha256"):
                return False, f"UPSTREAM_DATASET_SHA_MISMATCH:{stage_id}"
            if required_ds.get("reference_count") is not None:
                observed_count=sm.get("dataset_reference_count")
                if observed_count is None: observed_count=sm.get("reference_count")
                if observed_count is None: observed_count=sm.get("input_count")
                try: observed_count=int(observed_count)
                except Exception: observed_count=None
                if observed_count!=int(required_ds.get("reference_count")):
                    return False, f"UPSTREAM_REFERENCE_COUNT_MISMATCH:{stage_id}"
        return True, None

    def _formal_confirmed(self, rec):
        return bool(rec.get("formal_confirmed"))

    def confirm_formal(self, package_key):
        p=self._record_path(package_key); rec=read_json(p,{})
        if not rec: raise RuntimeError("PACKAGE_NOT_FOUND")
        if rec.get("mode")!="FORMAL": raise RuntimeError("NOT_A_FORMAL_PACKAGE")
        rec["formal_confirmed"]=True
        self._event(rec,"READY","Formal execution confirmed by user.")
        return rec

    def _install(self, rec):
        m=rec["manifest"]; stage=Path(rec["staging_root"]); repo=Path(self.paths["repo_root"])
        plan=m.get("install_plan") or []
        if not plan:
            return
        self._event(rec,"INSTALLING",f"Applying {len(plan)} install plan item(s).")
        for item in plan:
            src=validate_relative_inside(item["source"],stage,"INSTALL_SOURCE")
            dst=validate_install_destination(item["destination"],repo,self.settings)
            policy=item.get("policy","CREATE_ONLY")
            if dst.exists():
                if policy=="CREATE_ONLY":
                    raise PackageSecurityError(f"INSTALL_TARGET_EXISTS_CREATE_ONLY:{item['destination']}")
                stamp=datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                backup=Path(self.paths["backup_root"])/rec["package_key"]/stamp/Path(item["destination"])
                backup.parent.mkdir(parents=True,exist_ok=True)
                if dst.is_dir(): shutil.copytree(dst,backup,dirs_exist_ok=True)
                else: shutil.copy2(dst,backup)
            if src.is_dir():
                dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copytree(src,dst,dirs_exist_ok=(policy=="CREATE_OR_UPDATE"))
            else:
                dst.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(src,dst)

    def _subst(self, value, envmap):
        s=str(value)
        for k,v in envmap.items():
            s=s.replace("${"+k+"}",str(v))
        return s

    def _command(self, rec, run_dir:Path):
        m=rec["manifest"]; ep=m["entrypoint"]; root=Path(rec["staging_root"])
        epfile=validate_relative_inside(ep["file"],root,"ENTRYPOINT")
        envmap={
            "PACKAGE_ROOT":root,
            "REPO_ROOT":Path(self.paths["repo_root"]),
            "RUN_DIR":run_dir,
            "DATASET_MANIFEST":Path(self.paths["dataset_manifest"]),
            "DEV_JOB_ROOT":Path(self.paths["dev_job_root"]),
        }
        args=[self._subst(x,envmap) for x in (ep.get("arguments") or [])]
        typ=ep["type"]
        if typ=="cmd":
            cmd=["cmd.exe","/d","/s","/c",str(epfile),*args]
        elif typ=="python":
            py=ep.get("python") or sys.executable
            py=self._subst(py,envmap)
            cmd=[py,str(epfile),*args]
        elif typ=="node":
            node=ep.get("node") or shutil.which("node") or "node"
            cmd=[node,str(epfile),*args]
        else:
            raise PackageSecurityError("ENTRYPOINT_TYPE_NOT_ALLOWED")
        return cmd,envmap

    def _parse_progress(self,line,progress):
        m=re.search(r"\[(\d+)\s*/\s*(\d+)\]",line)
        if m:
            progress["current"]=int(m.group(1)); progress["total"]=int(m.group(2))
        m=re.search(r"(?:CURRENT|REFERENCE|REF)\s*[=:]\s*([A-Za-z0-9._-]+)",line,re.I)
        if m: progress["current_item"]=m.group(1)
        progress["last_line"]=line[-500:]

    def _execute(self, rec):
        self._verify_pinned_dataset(rec,"PRE")
        self._install(rec)
        run_id=datetime.datetime.now().strftime("%Y%m%d_%H%M%S")+"_"+_safe_name(rec["package_id"])
        run_dir=Path(self.paths["workspace_root"])/run_id
        run_dir.mkdir(parents=True,exist_ok=True)
        log_path=run_dir/"live.log"
        cmd,envmap=self._command(rec,run_dir)
        env=os.environ.copy()
        env.update({
            "YOYO_PACKAGE_ID":rec["package_id"],
            "YOYO_PACKAGE_VERSION":rec["package_version"],
            "YOYO_PACKAGE_ROOT":str(envmap["PACKAGE_ROOT"]),
            "YOYO_REPO_ROOT":str(envmap["REPO_ROOT"]),
            "YOYO_RUN_DIR":str(run_dir),
            "YOYO_DATASET_MANIFEST":str(envmap["DATASET_MANIFEST"]),
            "YOYO_DEV_JOB_ROOT":str(envmap["DEV_JOB_ROOT"]),
            "PYTHONUNBUFFERED":"1"
        })
        rec["run_id"]=run_id; rec["run_dir"]=str(run_dir); rec["live_log_path"]=str(log_path)
        self._event(rec,"RUNNING","Entrypoint running.",run_id=run_id,run_dir=str(run_dir))
        self._save_state(active_package_id=rec["package_id"],active_run_id=run_id,live_log_tail=[],progress={})
        start=time.time(); tail=[]; progress={}
        with log_path.open("w",encoding="utf-8",errors="replace") as log:
            p=subprocess.Popen(cmd,cwd=rec["staging_root"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                               text=True,encoding="utf-8",errors="replace",env=env,bufsize=1)
            try:
                while True:
                    line=p.stdout.readline() if p.stdout else ""
                    if line:
                        log.write(line); log.flush()
                        line=line.rstrip("\r\n")
                        tail.append(line); tail=tail[-120:]
                        self._parse_progress(line,progress)
                        self._save_state(live_log_tail=tail,progress=progress,active_package_id=rec["package_id"],active_run_id=run_id)
                    if p.poll() is not None:
                        # drain
                        if p.stdout:
                            for rest in p.stdout:
                                log.write(rest)
                                rest=rest.rstrip("\r\n")
                                tail.append(rest); tail=tail[-120:]
                        break
                    if time.time()-start > int(rec["manifest"]["timeout_seconds"]):
                        p.kill()
                        rec["exit_code"]=-9
                        raise RuntimeError("PACKAGE_EXECUTION_TIMEOUT")
                    time.sleep(0.05)
                rc=p.returncode
            finally:
                try:
                    if p.poll() is None: p.kill()
                except Exception: pass
        rec["exit_code"]=rc
        rec["live_log_tail"]=tail
        self._save_record(rec)
        # Dataset authority is checked again even when the entrypoint itself failed,
        # so a concurrent Dataset mutation can never be hidden by a later import.
        self._verify_pinned_dataset(rec,"POST")
        if rc != 0:
            raise RuntimeError(f"ENTRYPOINT_EXIT_CODE_{rc}")
        return run_dir

    def _expected_paths(self,rec,run_dir):
        out=[]
        for x in rec["manifest"].get("expected_outputs") or []:
            rel=x["path"] if isinstance(x,dict) else str(x)
            p=validate_relative_inside(rel,run_dir,"EXPECTED_OUTPUT")
            out.append((rel,p))
        return out

    def _import_result(self,rec,run_dir):
        self._event(rec,"IMPORTING","Reading run_manifest / gate / summary.")
        # Recheck at the import boundary so Dataset drift cannot hide in the
        # small interval between process completion and result normalization.
        self._verify_pinned_dataset(rec,"POST")
        expected=self._expected_paths(rec,run_dir)
        missing=[rel for rel,p in expected if not p.exists()]
        if missing:
            raise RuntimeError("EXPECTED_OUTPUT_MISSING:"+",".join(missing))
        rm=read_json(run_dir/"run_manifest.json",{}) or {}
        gate=read_json(run_dir/"gate.json",{}) or {}
        summary=read_json(run_dir/"summary.json",{}) or {}
        # Identity / mode checks if package produced them.
        if rm.get("stage") and rm.get("stage") != rec["stage"]:
            raise RuntimeError("OUTPUT_STAGE_MISMATCH")
        if rm.get("formal_claim_allowed") is True and rec["mode"]=="DEV":
            raise RuntimeError("DEV_OUTPUT_ILLEGAL_FORMAL_CLAIM")
        pinned=rec.get("pinned_dataset") or {}
        if rm.get("dataset_id") and rm.get("dataset_id")!=pinned.get("dataset_id"):
            raise DatasetLineageDriftError("HOLD_DATASET_LINEAGE_DRIFT:OUTPUT_DATASET_ID_MISMATCH")
        if rm.get("dataset_manifest_sha256") and rm.get("dataset_manifest_sha256")!=pinned.get("manifest_sha256"):
            raise DatasetLineageDriftError("HOLD_DATASET_LINEAGE_DRIFT:OUTPUT_DATASET_SHA_MISMATCH")
        success=rec["manifest"].get("success_gate")
        gate_pass,actual_gate,gate_identity_field=self._success_gate_matches(rec,gate)
        status="PASS" if gate_pass else ("HOLD" if str(gate.get("status","")).upper().startswith("HOLD") else "FAIL")
        affects = bool(status=="PASS" and rec.get("mainline_effect")=="STAGE_GATE" and rec.get("run_mode")=="FULL")
        # normalize Control Center run record
        cc_run_id=rec["run_id"]
        cc_dir=self.root/"runs"/cc_run_id
        (cc_dir/"logs").mkdir(parents=True,exist_ok=True); (cc_dir/"artifacts").mkdir(parents=True,exist_ok=True)
        runs=list_runs(self.root/"runs")
        prev=previous_same_stage(runs,rec["stage"])
        normalized={
            "run_id":cc_run_id,"phase":rec["phase"],"stage":rec["stage"],
            "run_mode":rec.get("run_mode","FULL"),"package_id":rec["package_id"],
            "package_version":rec["package_version"],"package_sha256":rec["zip_sha256"],
            "dataset_id":pinned.get("dataset_id"),
            "dataset_manifest_sha256":pinned.get("manifest_sha256"),
            "dataset_reference_count":pinned.get("reference_count"),
            "dataset_lineage":rec.get("dataset_lineage"),
            "code_version":rm.get("code_version") or rec["package_version"],
            "config_sha256":rm.get("config_sha256"),
            "environment_fingerprint":rm.get("environment_fingerprint") or environment_fingerprint()["sha256"],
            "started_at":rm.get("started_at"),"finished_at":rm.get("finished_at") or now_iso(),
            "input_count":rm.get("input_count"),"output_count":rm.get("output_count"),
            "status":status,"formal_claim_allowed":bool(rm.get("formal_claim_allowed",False)),
            "previous_run_id":prev["manifest"].get("run_id") if prev else None,
            "affects_stage_state":affects,"gate_name":actual_gate if gate_pass else None,
            "gate_identity_field":gate_identity_field
        }
        write_json(cc_dir/"run_manifest.json",normalized)
        write_json(cc_dir/"gate.json",gate)
        write_json(cc_dir/"summary.json",summary or {
            "what":f"執行 package {rec['package_id']}",
            "why":"Package-driven mainline execution.",
            "input":"See run_manifest.json","result":status,
            "difference":"See diff_from_previous.json",
            "next":"Control Center recalculates next allowed Stage."
        })
        write_json(cc_dir/"diff_from_previous.json",diff_manifests(prev["manifest"] if prev else None,normalized))
        shutil.copy2(run_dir/"live.log",cc_dir/"logs"/"live.log") if (run_dir/"live.log").is_file() else None
        write_json(cc_dir/"artifacts"/"package_pointer.json",{"package_queue_key":rec["package_key"],"run_dir":str(run_dir)})
        rec["result_status"]=status; rec["mainline_progressed"]=affects
        self._save_record(rec)
        build_state(self.root)
        return status,affects

    def _archive(self,rec,bucket):
        if not self.settings.get("auto_archive_completed_zip",True): return
        src=Path(rec["zip_path"])
        if not src.is_file(): return
        dst=Path(self.paths["package_archive"])/bucket/src.name
        if dst.exists():
            dst=dst.with_name(dst.stem+"_"+rec["zip_sha256"][:10]+dst.suffix)
        shutil.move(str(src),str(dst))
        rec["archived_zip_path"]=str(dst)
        self._save_record(rec)

    def _process_record(self,rec):
        try:
            if rec["status"]=="NEW":
                rec=self._stage_and_validate(rec)
            ready,reason=self._upstream_ready(rec)
            if not ready:
                self._set_waiting_upstream(rec,reason)
                return
            if rec.get("mode")=="FORMAL" and not self._formal_confirmed(rec):
                self._event(rec,"WAITING_FORMAL_CONFIRMATION","Formal package validated; waiting for one manual confirmation.")
                return
            if rec.get("mode")=="DEV" and not self.settings.get("auto_run_dev_packages",True):
                self._event(rec,"READY","DEV package ready; auto-run DEV is OFF.")
                return
            if rec.get("mode")=="FORMAL" and not self.settings.get("auto_run_formal_packages",False):
                # even after confirmation, user-triggered processing is required; confirm sets READY.
                if rec.get("formal_confirmed") and rec.get("status")!="READY":
                    self._event(rec,"READY","Formal package confirmed and ready.")
                return
            run_dir=self._execute(rec)
            status,progressed=self._import_result(rec,run_dir)
            if status=="PASS":
                self._event(rec,"PASS","Package completed successfully.",mainline_progressed=progressed)
                self._archive(rec,"completed")
            elif status=="HOLD":
                self._event(rec,"HOLD","Package finished but Gate returned HOLD.")
                self._archive(rec,"hold")
            else:
                self._event(rec,"FAIL","Package outputs did not satisfy success Gate.")
                self._archive(rec,"failed")
        except DatasetLineageDriftError as e:
            self._event(rec,"HOLD",str(e),mainline_progressed=False,dataset_lineage_hold=True)
            self._archive(rec,"hold")
        except PackageSecurityError as e:
            self._event(rec,"REJECTED",str(e))
            self._archive(rec,"rejected")
        except Exception as e:
            self._event(rec,"FAIL",f"{type(e).__name__}: {e}")
            self._archive(rec,"failed")
        finally:
            self._save_state(active_package_id=None,active_run_id=None)

    def tick(self):
        self.refresh_settings()
        if self.settings.get("watch_enabled",True):
            self._discover_new_zips()
        # PHASE B — WAITING reevaluation is independent from execution scheduling.
        # Malformed legacy records are contained per-record and cannot crash the tick.
        self._reevaluate_waiting_records(self.list_records())
        # PHASE C — Pick the oldest *executable* package, never the oldest blocked record.
        for rec in sorted(self.list_records(),key=lambda x:x.get("detected_at","")):
            if not self._is_executable(rec):
                continue
            self._process_record(rec)
            break

    def run_loop(self):
        while not self.stop_flag:
            try: self.tick()
            except Exception:
                self._save_state(last_event="Automation loop error: "+traceback.format_exc()[-1500:])
            time.sleep(max(1,int(self.settings.get("watch_interval_seconds",2))))

    def start(self):
        if self.worker and self.worker.is_alive(): return
        self.worker=threading.Thread(target=self.run_loop,daemon=True,name="YOYO-PackageManager")
        self.worker.start()

    def stop(self):
        self.stop_flag=True

    def automation_snapshot(self):
        st=self._load_state()
        st["settings"]=read_json(self.settings_path,{})
        st["queue"]=self.list_records()
        return st
