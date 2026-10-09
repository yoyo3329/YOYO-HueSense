# HueSense 工作台 × 現有 SAM2 / OpenCLIP

這是獨立的互動工作台整合，基於 GitHub `main` 的 `fa586c9e539708013f1886b6801f082f0ee84645`。
不修改 A2 runner、認證檔、研究資料、Docker 設定、B1/B2 gate；不宣稱這個新增的互動模式已具有研究認證。

## 現有進度與沿用項目

- SAM2：`facebook/sam2.1-hiera-tiny`，revision 取現有 `sam_lock.json`。
- OpenCLIP：`ViT-B-32-quickgelu / openai`，沿用 `openclip_lock.json` 的 state-dict hash 與 QuickGELU 數量。
- Python：使用 `YOYO_PYTHON_EXE`，依既有 `requirements_certified.txt` 核對版本。**不安裝、不更新套件，不自動下載權重。**
- 推論維持 Windows 本機 CPU；與现有 clean-repro 模型設定一致，不將推論搬進 Docker。
- SAM2 提供正/負點及框選分割；工作台保留遮罩確認、筆刷修正、換色、A/B/C、匯出。
- OpenCLIP 比較使用者輸入的描述與原圖；輸出 cosine similarity，不是分類機率、物件真值、配色分數或 B2 證據。

原有 `services/clip-service/clip_service.py` 使用 `ViT-B-32`。此整合不使用該較舊服务作為已認證 OpenCLIP 的替代，也不修改它。

## Windows 啟動

先將此整合分支取得到你的目前程式目錄，並保留未提交的本機工作。不要覆寫其他研究分支或強制重設。

沿用已設定的 `YOYO_CODE_ROOT`（目前 checkout）及 `YOYO_PYTHON_EXE`（既有 Python）。
從檔案總管執行：

```text
services\studio-bridge\START_STUDIO.cmd
```

啟動程式先檢查：

1. `YOYO_CODE_ROOT`、`YOYO_PYTHON_EXE` 已設定。
2. 既有 CLIP checkpoint 存在；預設 `%USERPROFILE%\.cache\clip\ViT-B-32.pt`。
3. Python 相依版本符合 repo 的 certified requirements。
4. SAM2 snapshot revision、權重檔案長度與 SHA-256 符合鎖定檔。
5. OpenCLIP 權重雜湊與 QuickGELU 模組數量符合鎖定檔。

如果 CLIP checkpoint 在其他地方，先設定機器本地的環境變數 `YOYO_CLIP_CHECKPOINT` 為實際檔案路徑。不要把權重或私密設定提交到 GitHub。

載入完成後會自動開啟 `http://127.0.0.1:8777/editor/`，連線碼經 URL fragment 傳入後立即從網址移除。終端機保持開啟。若瀏覽器未自動開啟，使用終端機顯示的完整本機網址。

不同機器上的 SAM cache 路徑可用 `--sam-snapshot` 明確指定，資料夾名稱仍須為鎖定 revision。不要編輯原本的認證檔來繞過檢查。

也可使用 PowerShell 明確啟動：

```powershell
$cert = Join-Path $env:YOYO_CODE_ROOT 'tools\b1\stylecolor-v0.8a2.1-clean-repro\certification'
& $env:YOYO_PYTHON_EXE (Join-Path $env:YOYO_CODE_ROOT 'services\studio-bridge\server.py') `
  --code-root $env:YOYO_CODE_ROOT `
  --sam-lock (Join-Path $cert 'sam_lock.json') `
  --openclip-lock (Join-Path $cert 'openclip_lock.json') `
  --clip-checkpoint $env:YOYO_CLIP_CHECKPOINT
```

## 網站與本機的界線

Sites 網站提供同一套 UI 與手動模式。AI 推論必須在上述啟動程式開啟的本機工作台操作。此版本沒有公網推論 API，不會從雲端直接存取你的 localhost；也沒有啟動 tunnel 或對外開放模型。

連接程式只綁定 `127.0.0.1`，API 需要每次啟動的隨機 bearer token，檢查 Host/Origin、不開放跨來源。它只服務 `public/studio/`，不提供研究資料根目錄、執行任意套件、或修改 gate 的 API。

## API

所有 API 必須有 `Authorization: Bearer <本次連線碼>`。不接受外部圖片 URL。

- `GET /api/health`：模型 readiness / identity、CPU 狀態；`research_authority=false`、`b2_released=false`。
- `POST /api/segment`：`request_id`、PNG/JPEG `image` data URL、`points:[{x,y,label}]`（座標 0–1，label 1/0）、可選 `box:[x0,y0,x1,y1]`。回傳選取的真實 SAM2 mask（RLE `[start,length]`、width、height）、`predicted_iou` 與 confirmation flag。
- `POST /api/score`：`request_id`、`image`、`texts`（1–8 組）。回傳 cosine similarity，沒有真值宣稱。
- 推論忙碌回 429；輸入錯誤回 400；模型例外回 503，沒有假遮罩 fallback。

瀏覽器使用遞增請求狀態與 request_id 檢查，換圖、換圖層、復原、重新選取時淘汰舊回應。取消會中斷瀏覽器等待；已進入模型的 CPU 計算可能繼續完成，期間新的推論回 429。

## 品質與限制

- 此整合程式已寫入，但 **本次沒有使用者 Windows 模型環境、cache 或權重，因此沒有完成真實推論或瀏覽器端到端驗收**。
- SAM2 以最多 1200 px 的原圖預覽推論。選區可手動修正，匯出按比例映射到原尺寸；不宣稱原解析度推論或髮絲級精準。
- 使用固定 snapshot 的 Sam2Model / Sam2Processor 互動呼叫；沿用模型身分不代表沿用批次研究 runner 的所有生成參數或研究結論。
- CLIP 是對原圖評分，較適合英文描述；不自動改圖層名稱，不直接生成色票。
- 不自動發布或解除 README 中 B2 的 HOLD_COLOR_EVIDENCE_AUTHORITY。

## 驗證

```powershell
& $env:YOYO_PYTHON_EXE -m unittest discover -s services/studio-bridge/tests -v
node services/studio-bridge/tests/test_frontend.cjs
```

自動測試使用明確的 model test double 驗證 HTTP 契約、存取控制、輸入驗證、RLE、錯誤不偽造遮罩與檔案雜湊檢查。這些測試不是 SAM2/OpenCLIP 真實推論證據。

本機待驗收：

1. 啟動後 health 顯示兩個模型 ready，identity 檢查通過。
2. 上傳圖片，正向點能產生物件候選遮罩，負向點／框選可重新推論。
3. 未確認的紫色遮罩不能直接換色；確認後僅選區改色。
4. 推論途中換圖或切换圖層，舊遮罩不覆蓋新狀態。
5. OpenCLIP 對 2–3 組英文描述返回真實分數，標示其非機率性質。
6. 儲存 A/B/C、JSON 重開與原尺寸 PNG 匯出，遮罩對齊、區域外不變。

互動 SAM2 API 依據：https://huggingface.co/docs/transformers/model_doc/sam2
