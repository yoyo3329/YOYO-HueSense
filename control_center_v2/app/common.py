from __future__ import annotations
from pathlib import Path
import json, hashlib, datetime, os, subprocess, platform

ROOT=Path(__file__).resolve().parent.parent

def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def read_json(path, default=None):
    p=Path(path)
    if not p.is_file():
        return default
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json(path, obj):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

def sha256_file(path):
    h=hashlib.sha256()
    with Path(path).open("rb") as f:
        for b in iter(lambda:f.read(1024*1024), b""):
            h.update(b)
    return h.hexdigest()

def json_fingerprint(obj):
    raw=json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",",":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()

def safe_rel(path):
    try:
        return str(Path(path).resolve().relative_to(ROOT.resolve()))
    except Exception:
        return str(path)

def git_commit(path=None):
    cwd=str(path or ROOT)
    try:
        p=subprocess.run(["git","rev-parse","HEAD"],cwd=cwd,capture_output=True,text=True,timeout=3)
        if p.returncode==0:
            return p.stdout.strip()
    except Exception:
        pass
    return None

def environment_fingerprint():
    rec={
        "python":platform.python_version(),
        "os":platform.system(),
        "os_release":platform.release(),
        "machine":platform.machine(),
    }
    rec["sha256"]=json_fingerprint(rec)
    return rec
