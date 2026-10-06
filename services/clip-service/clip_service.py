"""
本地 CLIP 推論服務 — 給 clip_benchmark.py 呼叫用

這支程式做的事：
1. 啟動時把 CLIP 模型從網路下載一次（之後就存在本機硬碟，不會每次都重下載）。
2. 開一個小型網頁伺服器，監聽 127.0.0.1:8765（也就是「只有你自己這台電腦」能連進來，
   外部網路連不進來，比較安全）。
3. 提供兩個網址：
   - GET  /health  → 用來確認服務有沒有活著
   - POST /score   → 真正拿圖片網址 + 文字，回傳相似度分數

執行方式（在這個檔案所在的資料夾底下）：
    pip install -r requirements.txt
    python clip_service.py

跑起來之後畫面應該會停在類似：
    * Running on http://127.0.0.1:8765
這樣代表啟動成功，這個視窗要保持開著，不要關掉，
之後你另外開一個瀏覽器分頁打 http://127.0.0.1:8765/health 應該就能看到回應了。
"""

from __future__ import annotations

import io
import os
import logging

import requests
import torch
from flask import Flask, jsonify, request
from PIL import Image

# open_clip 是目前最常用、免費、開源的 CLIP 實作，
# 第一次執行時會自動從網路下載模型權重檔（存在使用者家目錄下的快取資料夾，
# 之後開機不用再下載）。
import open_clip

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clip_service")

app = Flask(__name__)

# ----------------------------------------------------------------------
# 模型設定
# ----------------------------------------------------------------------
# ViT-B-32 是速度與準確度平衡最好的入門款，一般筆電（甚至沒有獨立顯卡）
# 也跑得動；如果你有 NVIDIA 顯卡，會自動用 GPU 加速，沒有的話會自動退回 CPU。
MODEL_NAME = "ViT-B-32"
PRETRAINED = "openai"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
logger.info("Loading CLIP model %s (%s) on %s ...", MODEL_NAME, PRETRAINED, DEVICE)

model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
tokenizer = open_clip.get_tokenizer(MODEL_NAME)
model.to(DEVICE)
model.eval()

logger.info("CLIP model loaded. Service ready.")

IMAGE_FETCH_TIMEOUT = 15  # 秒；抓圖片太慢就放棄，回報這張失敗，不要卡住整批


# ----------------------------------------------------------------------
# /health — 確認服務活著
# ----------------------------------------------------------------------
@app.get("/health")
def health():
    return jsonify({
        "ok": True,
        "status": "ready",
        "model": MODEL_NAME,
        "pretrained": PRETRAINED,
        "device": DEVICE,
    })


# ----------------------------------------------------------------------
# /score — 主要功能：圖片 + 文字 → 相似度分數
# ----------------------------------------------------------------------
@app.post("/score")
def score():
    """
    請求格式（跟 clip_benchmark.py 送出的一致）：
    {
      "text": "Y2K aesthetic",
      "images": [
        {"id": "abc123", "image_url": "https://...", "fallback_url": "https://...（可省略）"},
        {"id": "def456", "image_url": "https://..."}
      ]
    }

    兩層 fallback（v1.1）：
    - 先試 image_url（通常是 image_regular / analysis_url，兩者原本就是同一個網址，
      所以這裡只送一次，不會重複打兩次一樣的 request）。
    - 失敗（下載逾時、404/403、內容不是有效圖片格式）才試 fallback_url
      （通常是 Google 的縮圖網址 image_small，被原平台擋爬蟲時這個網址往往還抓得到）。
    - 兩個都失敗，才回傳 error，clip_benchmark.py 那邊會歸類成 clip_error。

    回應格式：
    {
      "results": [
        {"id": "abc123", "score": 0.3123, "used_url": "primary"},
        {"id": "def456", "score": 0.2011, "used_url": "fallback"},
        {"id": "ghi789", "score": null, "error": "download_failed"}
      ]
    }

    `used_url` 讓你之後想追蹤「有多少張是靠 fallback 救回來的」時，不用重新下載一次就能看出來。
    """
    payload = request.get_json(force=True, silent=True) or {}
    text = str(payload.get("text", "")).strip()
    images = payload.get("images", [])

    if not text:
        return jsonify({"error": "missing 'text'"}), 400
    if not isinstance(images, list) or not images:
        return jsonify({"error": "missing or empty 'images'"}), 400

    # 文字只需要編碼一次，所有圖片共用同一個文字向量。
    with torch.no_grad():
        text_tokens = tokenizer([text]).to(DEVICE)
        text_features = model.encode_text(text_tokens)
        text_features = text_features / text_features.norm(dim=-1, keepdim=True)

    results = []
    valid_tensors = []
    valid_ids = []
    valid_used_url = []

    for item in images:
        img_id = str(item.get("id", ""))
        primary_url = str(item.get("image_url", ""))
        fallback_url = str(item.get("fallback_url", "") or "")

        img = None
        used_url = None

        for candidate_url, tag in ((primary_url, "primary"), (fallback_url, "fallback")):
            if not candidate_url:
                continue
            try:
                resp = requests.get(candidate_url, timeout=IMAGE_FETCH_TIMEOUT)
                resp.raise_for_status()
                img = Image.open(io.BytesIO(resp.content)).convert("RGB")
                used_url = tag
                break
            except Exception as exc:  # noqa: BLE001 — 這一層失敗就換下一層試，不直接放棄
                logger.warning(
                    "image fetch failed (%s): id=%s url=%s err=%s", tag, img_id, candidate_url, exc
                )

        if img is None:
            results.append({"id": img_id, "score": None, "error": "download_failed"})
            continue

        tensor = preprocess(img)
        valid_tensors.append(tensor)
        valid_ids.append(img_id)
        valid_used_url.append(used_url)

    if valid_tensors:
        with torch.no_grad():
            batch = torch.stack(valid_tensors).to(DEVICE)
            image_features = model.encode_image(batch)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            similarities = (image_features @ text_features.T).squeeze(-1)

        for img_id, sim, used in zip(valid_ids, similarities.tolist(), valid_used_url):
            results.append({"id": img_id, "score": float(sim), "used_url": used})

    # 保持跟原本 request 一樣的順序，方便你比對
    order = {str(item.get("id", "")): i for i, item in enumerate(images)}
    results.sort(key=lambda r: order.get(r["id"], 0))

    return jsonify({"results": results})


if __name__ == "__main__":
    # host="127.0.0.1" 代表只有你自己這台電腦能連進來，外部網路連不到，比較安全。
    host = os.getenv("YOYO_CLIP_HOST", "127.0.0.1")
    port = int(os.getenv("YOYO_CLIP_PORT", "8765"))
    app.run(host=host, port=port, debug=False)