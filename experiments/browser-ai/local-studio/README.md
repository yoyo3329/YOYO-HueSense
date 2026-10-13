# HueSense SAM2.1 — 任意物件「點一下就選區」本機整合

**狀態：已提交可執行程式與契約測試；尚未在使用者 Windows 電腦跑過真實 SAM2 推論／瀏覽器端到端驗收。不可把此版視為已通過的成品。**

## 我們保留什麼？

- 同一條分支：`feature/huesense-browser-ai-rnd`，不新增分支，不合併 PR #2／main。
- 用 **最新** `sites/huesense-color-studio/source/dist/` 原始編輯器；本整合只在本機伺服器供應替代 `/editor/ai.js`，不改動該網站的原始 JS、42 個 SVG、Canvas 或配色。
- 本機 URL `http://127.0.0.1:8779/editor/`，**不會自動影響 GPT Sites 公開網址**。
- Docker 三個研究容器不重啟、不修改、不重新 Build；既有 8778 OpenCLIP preview 可照舊使用。本版 8779 先專注 SAM2.1 真實分割；8779 上 OpenCLIP 控制停用而非偽裝成功。
- 原本 C: 路徑的 SAM2.1 checkpoint **唯讀使用，不下載、複製或移動**。鎖定 revision `de431c4043854a71d8101e17995dfe596bf101a5`，weight SHA-256 `48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7`；模型身份檢查後才啟動 API。
- 圖片僅送至使用者電腦 `127.0.0.1`，JWT 類似的每次啟動隨機 bearer token、Host/Origin 檢查，不提供 CORS 外部存取；不在伺服器儲存圖片。**不要分享啟動時完整 URL/token。**

## 最短 Windows CMD 步驟

已有 `D:\HS_BROWSER_AI_RND`，**不要重新 Clone**：

```cmd
git -C D:\HS_BROWSER_AI_RND status --short
git -C D:\HS_BROWSER_AI_RND pull --ff-only origin feature/huesense-browser-ai-rnd
```

**若 status 顯示有未提交的變更，先保存，暫停 pull，不要使用 reset --hard。**

首次執行且尚無 `D:\HS_SAM2_GATE0\venv\Scripts\python.exe`：

```cmd
D:\HS_BROWSER_AI_RND\experiments\browser-ai\02_PREPARE_D_ENV.cmd
```

此步驟**經輸入 INSTALL 才會下載**鎖定的 Python CPU 套件，存放 D: 隔離 venv，暫存資料也指定至 D:。C: 的既有權重完全不動。它會從官方套件來源下載 **PyTorch 等依賴，但絕不重新下載 SAM2 權重**。如果官方 CPU 套件索引找不到精確版本，會停止；請回報錯誤，不要手動降版或從未驗證的來源下載。測試環境為 CPU，首次推論可能較久。你原本的 Windows 系統 Python 不會被修改。

安裝成功才啟動本機工作台：

```cmd
D:\HS_BROWSER_AI_RND\experiments\browser-ai\local-studio\START_SAM2_STUDIO.cmd
```

程式驗證模型 SHA-256、所有必要套件版本、離線載入成功後，才自動開啟 8779 的最新 HueSense 編輯器。若 8779 已被占用，不會中斷其他服務，只會顯示錯誤。Ctrl+C 停止**這個**伺服器。

## 操作

1. 載入狗、貓、服裝、人物、家具或任何物件照片。不是服裝專用；複雜邊緣及遮擋仍可能失敗。
2. 點選 **「AI 加入點」**，在影像物件內點一下。會**自動呼叫** `POST /api/segment`；無需再按「產生 AI 選區」。
3. 觀察紫色候選遮罩。如果邊界不準，選 **「AI 排除點」** 點背景，或 **「AI 框選」** 拖曳範圍；會重新自動推論。也可按「產生 AI 選區」手動重試。
4. 確認 AI 遮罩（紫色只是預覽），必要時使用手動筆刷，再按 **「確認此區域」**。
5. 選目標色彩、調整強度與羽化，並比較原圖、A/B/C，匯出 PNG 或專案 JSON。原始影像檔不會提交 GitHub。

注意：標準 Sites 編輯器「上傳」到最多 1600 萬像素，但推論的是最長邊 1200px 且不超過 160 萬像素的預覽；匯出是按比例重投影遮罩。細緻邊界可能需筆刷修正。選點可達 64 個，模型輸出會驗證 RLE row-major 的 `runs:[[start,length],...]`。**預測 IoU 不是實際辨識準確率。**

## API 契約

`GET /api/health` requires local Bearer token: `protocol: huesense-studio-v1` with `sam2.ready, sam2.identity_verified`. `openclip.ready=false` for this local Gate 0 preview.

`POST /api/segment` request: `{request_id, image:"data:image/png;base64,...",points:[{x:0..1,y:0..1,label:1 or 0}],box:[x0,y0,x1,y1] or null}`. Response: `request_id,source:"SAM2_REAL_INFERENCE",requires_confirmation:true,mask:{type:"rle",width,height,runs},predicted_iou,area_ratio,inference_ms`. Host only 127.0.0.1, token-required, max image 1.6MP. No synthetic-mask fallback. Inference lock = only one active request; concurrent request returns 429. Network/processing errors return error, never a fabricated "success".

Frontend reuses the latest Sites `app.js` for Canvas/color/export and overlays a local-only modified `ai.js` for auto-prompt; public site files remain untouched.

## Repo work review and tests

```cmd
python -m unittest discover -s D:\HS_BROWSER_AI_RND\experiments\browser-ai\local-studio\tests -v
```

Contract tests need no real AI model; RLE test skips if NumPy is unavailable. They test input validation, pinned revision and mask encoding boundaries. Passing them alone is **not** proof of real SAM2.1 inference. Real-model and browser end-to-end verification must run on Windows after dependencies are ready.

## Gates and evidence

- Model SHA-256/length: **PASS** from user-supplied Windows `certutil` preflight, dated 2026-10-13.
- Relevant code available: **PASS** (committed to this R&D branch).
- Isolated D: Python runtime: **NOT YET VERIFIED**.
- SAM2.1 real interactive dog/object photo: **USER SCREENSHOT OBSERVED — POSITIVE-POINT SEGMENTATION AND CANVAS MASK DISPLAY WORKING (2026-10-13)**. User screenshot shows local CPU AI connected, two positive points on a dog, a plausible purple object mask and an enabled confirmation button. This is visual evidence, not a recorded model latency, quantitative accuracy measure, or independent automated E2E test.
- Negative point/box mask correction: **NOT YET VERIFIED**.
- HueSense recolor → PNG export: **NOT YET VERIFIED**.
- OpenCLIP in same 8779 studio: **NOT IMPLEMENTED** (separate existing Docker OpenCLIP available in 8778).
- Docker migration: **DEFERRED** until full local acceptance, no research authority / Snapshot V2 RED HOLD changes.

## Known issues / acceptance notes

- Model processor may need small API corrections once pinned environment is actually exercised; do not silently switch checkpoints.
- CPU inference latency has not been measured on user's machine.
- No cloud/public GPU service is deployed; Sites cannot directly fetch user's localhost.
- Browser-level screenshot and visual quality must be checked by user on Windows.
- Existing research certification is read-only reference, not authorization for new research gates.

## 2026-10-13 interactive local evidence note

The user's local preview showed `SAM2.1 真實模型已連線（本機 CPU）` and `AI 選區已產生`, with a dog covered by a purple mask after two positive-point prompts. The `確認此區域` action is enabled, and most visible grass is unmasked. **This evidence is derived from an in-chat screenshot; the image itself and any browser token are intentionally not stored in Git.** No negative prompt, box refinement, confirmed recolor, unchanged-background pixel comparison, or PNG export has yet been verified. Keep those statuses pending.
