from __future__ import annotations
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, sys, webbrowser, threading, argparse, os, re
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from app.common import read_json
from app.state_engine import build_state
from app.history import list_runs
from app.gate_parser import explain_gate
from app.result_view import flatten_checks, important_diff
from importers.existing_results import import_existing
from app.watcher import ArtifactWatcher
from automation.package_manager import PackageManager
from app.report_index import list_reports, build_timeline
from app.report_generator import generate_report
from app.progress_journal import normalize_summary

PATHS=read_json(ROOT/"config"/"project_paths.json",{})
EXPLAIN=read_json(ROOT/"config"/"stage_explanations.zh-TW.json",{})
PM=None; WATCHER=None

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/"web"),**kwargs)
    def log_message(self,fmt,*args): pass
    def _json(self,obj,status=200):
        b=json.dumps(obj,ensure_ascii=False).encode("utf-8")
        self.send_response(status); self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        u=urlparse(self.path)
        if u.path=="/api/state":
            if WATCHER: WATCHER.refresh()
            return self._json(build_state(ROOT))
        if u.path=="/api/runs":
            rs=list_runs(ROOT/"runs")
            return self._json([{"manifest":r["manifest"],"summary":r["summary"]} for r in rs])
        if u.path=="/api/run":
            q=parse_qs(u.query); rid=(q.get("id") or [None])[0]; d=ROOT/"runs"/str(rid)
            if not d.is_dir(): return self._json({"error":"run not found"},404)
            m=read_json(d/"run_manifest.json",{}); s=read_json(d/"summary.json",{})
            g=read_json(d/"gate.json",{}); df=read_json(d/"diff_from_previous.json",{})
            registry=read_json(ROOT/"config"/"stage_registry.json",{}) or {}
            if not isinstance(s,dict) or not s.get("purpose"):
                s=normalize_summary(s or {},m,g,registry)
            return self._json({
                "manifest":m,"summary":s,"gate":g,"diff":df,
                "gate_explanations":explain_gate(g,EXPLAIN),
                "gate_checks":flatten_checks(g),
                "important_diff":important_diff(df)
            })
        if u.path=="/api/reports":
            return self._json(list_reports(PATHS))
        if u.path=="/api/timeline":
            registry=read_json(ROOT/"config"/"stage_registry.json",{}) or {}
            return self._json(build_timeline(ROOT,registry))
        if u.path.startswith("/reports/"):
            parts=[x for x in u.path.split("/") if x]
            if len(parts)!=3:
                return self._json({"error":"invalid report path"},404)
            _,run_id,kind=parts
            if not re.fullmatch(r"[A-Za-z0-9._-]{3,180}",run_id):
                return self._json({"error":"invalid run id"},400)
            base=Path(PATHS["result_reports_root"])/run_id
            name=f"{run_id}_RESULT.html" if kind=="html" else f"{run_id}_RESULT.pdf" if kind=="pdf" else None
            p=base/name if name else None
            if not p or not p.is_file():
                return self._json({"error":"report not found"},404)
            data=p.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type","text/html; charset=utf-8" if kind=="html" else "application/pdf")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers(); self.wfile.write(data); return
        if u.path=="/api/automation":
            return self._json(PM.automation_snapshot() if PM else {})
        if u.path=="/api/refresh":
            if WATCHER: WATCHER.refresh(True)
            if PM: PM.tick()
            return self._json({"state":build_state(ROOT),"automation":PM.automation_snapshot() if PM else {}})
        if u.path=="/":
            self.path="/index.html"
        return super().do_GET()
    def do_POST(self):
        u=urlparse(self.path); n=int(self.headers.get("Content-Length","0") or 0)
        try: body=json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception: body={}
        try:
            if u.path=="/api/automation/settings":
                return self._json({"ok":True,"settings":PM.update_settings(body or {})})
            if u.path=="/api/automation/confirm-formal":
                rec=PM.confirm_formal(body.get("package_key"))
                return self._json({"ok":True,"record":rec})
            if u.path=="/api/automation/run-ready":
                # Explicit one-shot execution for a READY package when auto-run is off.
                key=body.get("package_key"); rec=next((x for x in PM.list_records() if x.get("package_key")==key),None)
                if not rec: raise RuntimeError("PACKAGE_NOT_FOUND")
                if rec.get("status") not in ("READY","VALIDATED","STAGED"): raise RuntimeError("PACKAGE_NOT_READY")
                PM._process_record(rec)
                return self._json({"ok":True})
            if u.path=="/api/reports/open-folder":
                target=Path(PATHS["result_reports_root"])
                if body.get("run_id"):
                    target=target/str(body.get("run_id"))
                target.mkdir(parents=True,exist_ok=True)
                if os.name=="nt": os.startfile(str(target))
                else: webbrowser.open(target.as_uri())
                return self._json({"ok":True,"path":str(target)})
            if u.path=="/api/reports/generate":
                run_id=str(body.get("run_id") or "")
                if not re.fullmatch(r"[A-Za-z0-9._-]{3,180}",run_id):
                    raise RuntimeError("INVALID_RUN_ID")
                registry=read_json(ROOT/"config"/"stage_registry.json",{}) or {}
                result=generate_report(ROOT,run_id,PATHS,registry,source_roots=[])
                return self._json({"ok":True,"report":result})
        except Exception as e:
            return self._json({"ok":False,"error":f"{type(e).__name__}: {e}"},400)
        return self._json({"error":"not found"},404)

def main():
    global PM,WATCHER
    ap=argparse.ArgumentParser(); ap.add_argument("--host",default=os.getenv("YOYO_CONTROL_HOST","127.0.0.1")); ap.add_argument("--port",type=int,default=int(os.getenv("YOYO_CONTROL_PORT","8765"))); args=ap.parse_args()
    for d in ("runs","state"):
        (ROOT/d).mkdir(parents=True,exist_ok=True)
    import_existing(ROOT,PATHS); build_state(ROOT)
    WATCHER=ArtifactWatcher(ROOT,PATHS,4); WATCHER.start()
    PM=PackageManager(ROOT); PM.start()
    url=f"http://127.0.0.1:{args.port}/"
    httpd=ThreadingHTTPServer((args.host,args.port),Handler)
    print("="*100)
    print("YOYO CONTROL CENTER V2.1 - ZERO-MOVE CLOUD INBOX + GATE-DRIVEN AUTO RUNNER")
    print("="*100)
    print("Dashboard:",url)
    print("Automation:",url+"automation.html")
    print("Cloud Inbox:",PATHS.get("cloud_inbox_local"))
    print("DEV auto-run:",read_json(ROOT/"config"/"automation_settings.json",{}).get("auto_run_dev_packages"))
    print("FORMAL auto-run: OFF by design")
    print("="*100)
    threading.Timer(0.8,lambda:webbrowser.open(url)).start()
    try:httpd.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        if WATCHER:WATCHER.stop()
        if PM:PM.stop()

if __name__=="__main__": main()
