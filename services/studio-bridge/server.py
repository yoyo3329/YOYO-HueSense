"""Loopback-only studio bridge. Run with the existing certified Python executable."""
from __future__ import annotations
import argparse
import base64
import binascii
from functools import partial
import io
import json
import math
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import threading
from urllib.parse import urlsplit
import webbrowser

MAX_BODY = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 1600000


def validate_prompt(payload):
    points = payload.get('points', [])
    box = payload.get('box')
    if not isinstance(points, list) or len(points) > 64:
        raise ValueError('最多可使用 64 個提示點')
    def unit(x):
        return type(x) in (int, float) and math.isfinite(x) and 0 <= x <= 1
    for p in points:
        if not isinstance(p, dict) or not unit(p.get('x')) or not unit(p.get('y')) or type(p.get('label')) is not int or p['label'] not in (0, 1):
            raise ValueError('提示點格式錯誤')
    if box is not None and (not isinstance(box, list) or len(box) != 4 or not all(unit(x) for x in box) or box[0] >= box[2] or box[1] >= box[3]):
        raise ValueError('框選座標錯誤')
    if not box and not any(p['label'] == 1 for p in points):
        raise ValueError('至少需要一個正向點或框選')
    return points, box


def decode_image(value):
    from PIL import Image, ImageOps
    if not isinstance(value, str) or not value.startswith(('data:image/png;base64,', 'data:image/jpeg;base64,')):
        raise ValueError('請提供 PNG 或 JPEG 圖片，不接受外部圖片網址')
    try:
        raw = base64.b64decode(value.split(',', 1)[1], validate=True)
        with Image.open(io.BytesIO(raw)) as im:
            if im.format not in ('PNG', 'JPEG') or im.width * im.height > MAX_IMAGE_PIXELS:
                raise ValueError('推論圖片最多 160 萬像素')
            im.load()
            return ImageOps.exif_transpose(im).convert('RGB')
    except (binascii.Error, OSError) as e:
        raise ValueError('圖片解碼失敗') from e


def encode_runs(mask):
    import numpy as np
    flat = np.asarray(mask, dtype=bool).reshape(-1)
    edges = np.flatnonzero(np.diff(np.r_[False, flat, False].astype(np.int8)))
    return [[int(a), int(b - a)] for a, b in edges.reshape(-1, 2)]


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, static, models, token):
        super().__init__(address, partial(Handler, directory=str(static)))
        self.models = models
        self.token = token
        self.inference_lock = threading.Lock()
        self.allowed_hosts = {f'127.0.0.1:{self.server_port}', f'localhost:{self.server_port}'}
        self.origins = {'http://' + host for host in self.allowed_hosts}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        # Do not log private prompts, base64 images, or the launch URL/token.
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def send_json(self, status, data):
        raw = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def allowed(self, api=True):
        if self.headers.get('Host') not in self.server.allowed_hosts:
            self.send_json(403, {'error': 'HOST_NOT_ALLOWED'})
            return False
        origin = self.headers.get('Origin')
        if origin is not None and origin not in self.server.origins:
            self.send_json(403, {'error': 'ORIGIN_NOT_ALLOWED'})
            return False
        if api and not secrets.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + self.server.token):
            self.send_json(401, {'error': '請從啟動程式開啟的工作台連線，或輸入本次連線碼。'})
            return False
        return True

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            if self.allowed():
                self.send_json(200, {'ok': True, 'protocol': 'huesense-studio-v1', **self.server.models.health()})
            return
        if not self.allowed(api=False):
            return
        target = Path(self.translate_path(self.path)).resolve()
        root = Path(self.directory).resolve()
        if not target.is_relative_to(root) or any(part.startswith('.') for part in target.relative_to(root).parts):
            self.send_error(404)
            return
        if target.is_dir() and not (target / 'index.html').is_file():
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path not in ('/api/segment', '/api/score'):
            self.send_json(404, {'error': 'NOT_FOUND'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY:
                self.send_json(413, {'error': 'REQUEST_TOO_LARGE'})
                return
            if self.headers.get_content_type() != 'application/json':
                raise ValueError('必須使用 application/json')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError('請求必須為物件')
            request_id = payload.get('request_id')
            if not isinstance(request_id, str) or len(request_id) > 100:
                raise ValueError('缺少 request_id')
            if path == '/api/segment':
                points, box = validate_prompt(payload)
            else:
                texts = payload.get('texts')
                if not isinstance(texts, list) or not 1 <= len(texts) <= 8 or not all(isinstance(t, str) and 1 <= len(t.strip()) <= 160 for t in texts):
                    raise ValueError('請輸入 1 至 8 組描述，每組最多 160 字元')
            if not self.server.inference_lock.acquire(blocking=False):
                self.send_json(429, {'error': '模型正在處理其他請求，請稍後重試。'})
                return
            try:
                image = decode_image(payload.get('image'))
                if path == '/api/segment':
                    mask, score = self.server.models.segment(image, points, box)
                    result = {'request_id': request_id, 'mask': {'type': 'rle', 'width': image.width,
                              'height': image.height, 'runs': encode_runs(mask)}, 'predicted_iou': score,
                              'area_ratio': float(mask.mean()), 'source': 'SAM2_REAL_INFERENCE',
                              'requires_confirmation': True}
                else:
                    result = {'request_id': request_id, 'results': self.server.models.score(image, texts),
                              'score_semantics': 'CLIP_COSINE_NOT_PROBABILITY', 'truth_claim': False,
                              'research_authority': False}
            finally:
                self.server.inference_lock.release()
            self.send_json(200, result)
        except (ValueError, TypeError, KeyError) as e:
            self.send_json(400, {'error': str(e)[:200]})
        except Exception:
            self.send_json(503, {'error': '模型推論失敗；未產生替代遮罩。請檢查本機環境與記憶體後重試。'})


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--code-root', required=True)
    p.add_argument('--sam-lock', required=True)
    p.add_argument('--openclip-lock', required=True)
    p.add_argument('--clip-checkpoint', required=True)
    p.add_argument('--sam-snapshot')
    p.add_argument('--port', type=int, default=8777)
    p.add_argument('--no-open', action='store_true')
    a = p.parse_args()
    root = Path(a.code_root).resolve(strict=True)
    if root != Path(__file__).resolve().parents[2]:
        p.error('code-root must be this script repository checkout')
    import os
    if os.environ.get('YOYO_CODE_ROOT') and root != Path(os.environ['YOYO_CODE_ROOT']).resolve():
        p.error('YOYO_CODE_ROOT disagrees with --code-root')
    from models import LocalModels
    certified = root / 'tools/b1/stylecolor-v0.8a2.1-clean-repro'
    print('Checking local model identities; loading SAM2 and OpenCLIP on CPU...', flush=True)
    models = LocalModels(a.sam_lock, a.openclip_lock, certified / 'python/requirements_certified.txt',
                         a.clip_checkpoint, a.sam_snapshot)
    token = secrets.token_urlsafe(32)
    httpd = BridgeServer(('127.0.0.1', a.port), root / 'public/studio', models, token)
    url = f'http://127.0.0.1:{httpd.server_port}/editor/#bridge_token={token}'
    print('Interactive bridge ready. Keep this window open. Research/B2 authority remains unchanged.', flush=True)
    # Token stays on this local console/browser, never in repository files.
    print('Open this local URL if your browser does not open automatically:\n' + url, flush=True)
    if not a.no_open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == '__main__':
    main()
