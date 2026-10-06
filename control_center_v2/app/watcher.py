from __future__ import annotations
from pathlib import Path
import time, threading, glob, sys
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from importers.existing_results import import_existing
from app.state_engine import build_state

class ArtifactWatcher:
    def __init__(self, root, paths, interval=4):
        self.root=Path(root); self.paths=paths; self.interval=interval; self.stop_flag=False; self.sig=None
    def signature(self):
        items=[]
        p=Path(self.paths.get("dataset_manifest",""))
        items.append((str(p),p.stat().st_mtime_ns if p.is_file() else None))
        pat=self.paths.get("a1_gate_glob")
        if pat:
            for x in sorted(glob.glob(pat)):
                q=Path(x); items.append((str(q),q.stat().st_mtime_ns))
        hard=Path(self.paths.get("contract_hardening_archive_root",""))
        if hard.is_dir():
            for q in sorted(hard.glob("*/gate.json")):
                items.append((str(q),q.stat().st_mtime_ns))
        return tuple(items)
    def refresh(self,force=False):
        s=self.signature()
        if force or s!=self.sig:
            import_existing(self.root,self.paths); build_state(self.root); self.sig=s
    def loop(self):
        while not self.stop_flag:
            try:self.refresh()
            except Exception:pass
            time.sleep(self.interval)
    def start(self):
        self.refresh(True)
        threading.Thread(target=self.loop,daemon=True).start()
    def stop(self):self.stop_flag=True
