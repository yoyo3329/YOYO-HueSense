"""HueSense latest Sites dist + offline pinned Windows SAM2.1 loopback adapter.

Local, token-protected, single-user CPU inference. Existing CLIP Docker and three
research containers are untouched. No hidden SAM fallback, no cloud upload.
"""
from __future__ import annotations
import argparse
import base64
import binascii
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import json
import math
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.parse import urlsplit
import webbrowser

from sam_backend import SamBackend

MAX_REQUEST = 13 * 1024 * 1024
MAX_IMAGE_BYTES = 9 * 1024 * 1024
MAX_PIXELS = 1_600_000
LOCAL_HOSTS = {"127.0.0.1", "localhost"}

def validate_prompt(payload):
    if not isinstance(payload,dict):
        raise ValueError("JSON_OBJECT_REQUIRED")
    rid=payload.get("request_id")
    if not isinstance(rid,str) or not 1 <= len(rid) <= 100:
        raise ValueError("REQUEST_ID_REQUIRED")
    points=payload.get("points",[])
    box=payload.get("box")
    def unit(n):
        return type(n) in (int,float) and math.isfinite(n) and 0<=n<=1
    if not isinstance(points,list) or len(points)>64:
        raise ValueError("INVALID_POINTS")
    if any(not isinstance(p,dict) or not unit(p.get("x")) or not unit(p.get("y"))
           or type(p.get("label")) is not int or p["label"] not in (0,1) for p in points):
        raise ValueError("INVALID_POINTS")
    if box is not None and (not isinstance(box,list) or len(box)!=4 or not all(unit(n) for n in box)
                             or box[0]>=box[2] or box[1]>=box[3]):
        raise ValueError("INVALID_BOX")
    if box is None and not any(p["label"]==1 for p in points):
        raise ValueError("POSITIVE_POINT_OR_BOX_REQUIRED")
    return rid,points,box

def decode_image(src):
    if not isinstance(src,str):
        raise ValueError("IMAGE_REQUIRED")
    match=re.fullmatch(r"data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)",src)
    if not match:
        raise ValueError("PNG_JPEG_DATA_URL_REQUIRED")
    try:
        raw=base64.b64decode(match.group(2),validate=True)
    except binascii.Error as exc:
        raise ValueError("INVALID_IMAGE_BASE64") from exc
    if not 0<len(raw)<=MAX_IMAGE_BYTES:
        raise ValueError("IMAGE_BYTES_LIMIT")
    from PIL import Image, ImageOps
    try:
        with Image.open(BytesIO(raw)) as original:
            if original.format not in ("PNG","JPEG"):
                raise ValueError("PNG_JPEG_REQUIRED")
            if original.format.lower()!=match.group(1):
                raise ValueError("IMAGE_MIME_MISMATCH")
            if original.width*original.height>MAX_PIXELS or min(original.size)<1:
                raise ValueError("IMAGE_SIZE_LIMIT_1_6MP")
            original.load()
            return ImageOps.exif_transpose(original).convert("RGB")
    except OSError as exc:
        raise ValueError("IMAGE_DECODE_FAILED") from exc

class StudioServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,root,port,model,frontend):
        self.model=model
        self.token=secrets.token_urlsafe(32)
        self.lock=threading.Lock()
        self.frontend=Path(frontend)
        super().__init__(("127.0.0.1",port),partial(StudioHandler,directory=str(root)))
        self.hosts={f"{n}:{self.server_port}" for n in LOCAL_HOSTS}
        self.origins={"http://"+h for h in self.hosts}

class StudioHandler(SimpleHTTPRequestHandler):
    def log_message(self,format,*args):
        # Avoid logging local image contents, URL tokens or private file names.
        pass
    def end_headers(self):
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("X-Frame-Options","DENY")
        self.send_header("Referrer-Policy","no-referrer")
        super().end_headers()
    def json_reply(self,status,data):
        raw=json.dumps(data,ensure_ascii=False,allow_nan=False).encode("utf8")
        self.send_response(status)
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def authorized(self,api=False):
        if self.headers.get("Host") not in self.server.hosts:
            self.json_reply(403,{"error":"HOST_NOT_ALLOWED"})
            return False
        origin=self.headers.get("Origin")
        if origin is not None and origin not in self.server.origins:
            self.json_reply(403,{"error":"ORIGIN_NOT_ALLOWED"})
            return False
        if api and not secrets.compare_digest(self.headers.get("Authorization",""),
                                              "Bearer "+self.server.token):
            self.json_reply(401,{"error":"INVALID_LOCAL_SESSION_TOKEN"})
            return False
        return True
    def do_GET(self):
        route=urlsplit(self.path).path
        if not self.authorized(api=route.startswith("/api/")):
            return
        if route=="/api/health":
            self.json_reply(200,{
                "ok":True,"protocol":"huesense-studio-v1",
                "sam2":self.server.model.health(),
                "openclip":{"ready":False,"reason":"NOT_TOUCHED_IN_SAM_GATE0"},
                "device":"cpu","model_identity_verified":True,
                "research_authority":False,"b2_released":False,
            })
            return
        if route=="/editor/ai.js":
            data=self.server.frontend.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type","text/javascript; charset=utf-8")
            self.send_header("Content-Length",str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        root=Path(self.directory).resolve()
        target=Path(self.translate_path(self.path)).resolve()
        if not target.is_relative_to(root) or any(p.startswith(".") for p in target.relative_to(root).parts):
            self.send_error(404)
            return
        if target.is_dir() and not (target/"index.html").is_file():
            self.send_error(404)
            return
        super().do_GET()
    def do_POST(self):
        route=urlsplit(self.path).path
        if not self.authorized(api=True):
            return
        if route!="/api/segment":
            self.json_reply(404,{"error":"NOT_FOUND"})
            return
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<1 or length>MAX_REQUEST:
                self.json_reply(413,{"error":"REQUEST_TOO_LARGE"})
                return
            if self.headers.get_content_type()!="application/json":
                raise ValueError("JSON_CONTENT_TYPE_REQUIRED")
            payload=json.loads(self.rfile.read(length))
            rid,points,box=validate_prompt(payload)
            if not self.server.lock.acquire(blocking=False):
                self.json_reply(429,{"error":"SAM2 正在運算，請等待上一個選取完成。"})
                return
            try:
                image=decode_image(payload.get("image"))
                data=self.server.model.segment(image,points,box)
            finally:
                self.server.lock.release()
            self.json_reply(200,{"request_id":rid,**data})
        except (ValueError,TypeError,KeyError,json.JSONDecodeError) as exc:
            self.json_reply(400,{"error":str(exc)[:200]})
        except Exception as exc:
            # Log only error class and safe constant; private prompt/images never printed.
            print("SAM2 request failed:",type(exc).__name__,flush=True)
            self.json_reply(503,{"error":"SAM2 真實推論失敗，沒有使用假遮罩。請查看本機終端機。"})

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--site",required=True,help="path to latest HueSense source/dist")
    p.add_argument("--port",type=int,default=8779)
    p.add_argument("--snapshot",default=None)
    p.add_argument("--no-browser",action="store_true")
    args=p.parse_args()
    site=Path(args.site).resolve(strict=True)
    if not (site/"editor"/"index.html").is_file():
        p.error("HueSense latest dist editor not found")
    print("Verifying pinned SAM2.1 and loading original local weights (offline/CPU)...",flush=True)
    model=SamBackend(args.snapshot)
    service=StudioServer(site,args.port,model,Path(__file__).parent/"ai.js")
    uri=f"http://127.0.0.1:{service.server_port}/editor/#bridge_token={service.token}"
    print("SAM2.1 verified; model load seconds",model.load_seconds,flush=True)
    print("Local AI Studio ready. Open URL below on this PC:",flush=True)
    print(uri,flush=True)
    print("SAM2.1 only; existing Docker/OpenCLIP unchanged. Ctrl+C stops ONLY this local process.",flush=True)
    if not args.no_browser:
        webbrowser.open(uri)
    try:
        service.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        service.server_close()

if __name__=="__main__":
    main()
