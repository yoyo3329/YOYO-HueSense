# HueSense Browser AI R&D — 第一階段

獨立的 SAM2.1 Tiny Browser Provider 實驗。基底為備份 commit `c0e7896d4652fd0e3c005c53c982ad70176bfc86`，開發分支 `feature/huesense-browser-ai-rnd`。僅新增 `experiments/browser-ai/`；原始網站、42 款 SVG、BAKE 動畫、Canvas 配色、區域圖層與匯出均不修改。

**目前狀態：第一階段程式與離線測試已完成；瀏覽器 WebGPU 真實模型驗收待執行。不得把此分支視為已驗證的正式工作台整合。** Snapshot V2 維持 RED HOLD。沒有部署、訓練、研究 Gate、Docker、Windows Python Bridge 或 PR #2 修改。

## 最少 Windows 操作

需要 Git、Node.js 22+、新版 Chrome／Edge（開啟硬體加速）與可下載 npm／Hugging Face 的網路。請使用新資料夾，避免切換既有研究工作目錄。CMD 完整指令：

```cmd
cd /d "%USERPROFILE%"
git clone --single-branch --branch feature/huesense-browser-ai-rnd https://github.com/yoyo3329/YOYO-HueSense.git HueSense-Browser-AI-RND
cd /d "%USERPROFILE%\HueSense-Browser-AI-RND\experiments\browser-ai"
call START_BROWSER_AI.cmd
```

若 `HueSense-Browser-AI-RND` 已存在，請改用另一個新資料夾名稱，不要刪除或覆蓋原資料夾。

看到伺服器啟動訊息後：

1. Chrome／Edge 開啟 <http://localhost:8788/browser-test.html>，按「執行真實瀏覽器測試」。完成後下載 JSON 報告。這會自動測試真實 Worker、WebGPU、模型下載與校驗、點／框／修正、快取與圖片切換。下載約 151 MB；不會上傳圖片或模型。
2. 開啟 <http://localhost:8788/>，載入模型、選擇自己的橫向及直向圖片，目視核對提示與遮罩對齊、排除點、筆刷修正。回傳測試 JSON 與看到的錯誤即可；不必提供原始照片。

這兩個頁面各自建立模型 session；請先關閉測試頁再操作實驗頁，以免同時占用 GPU。Ctrl+C 只停止這個新 Node 靜態伺服器；不操作其他服務。8788 若被占用會直接報錯，不會停止占用者；可先 `set HUESENSE_PORT=8789` 再執行 CMD，並改用該 port。

## 在 Work 已完成的驗證

- `npm ci --ignore-scripts --no-audit --no-fund`：lockfile 固定依賴；不執行套件安裝腳本。
- `npm run prepare:runtime`：ONNX Runtime Web 1.24.3 的 ESM、JSEP WASM、授權檔複製到忽略的 `vendor/`；版本必須相同。
- `npm run check`：JS 語法與相對 import 路徑檢查。證據：`evidence/static-check.txt`。
- `npm test`：確定性資料處理單元測試，以及明確標記 MOCK 的模型／Worker 邊界測試；實際 Node Worker thread 的整合测试仍使用假模型。證據：`evidence/offline-tests.tap`。
- Linux CPU 真實模型 smoke：兩個已校驗的模型實際執行 encoder 與兩次 decoder（正向點、正負點＋框＋mask feedback）。使用自行生成圖形與 ONNX Runtime **1.31.0 CPU**，不是瀏覽器 **1.24.3 WebGPU**。證據：`evidence/cpu-smoke.json`。
- 原始二進位模型輸入／輸出實際讀取：`evidence/model-inspection.json`。

CPU smoke 的目的只是模型格式與前向運算檢查，不是瀏覽器驗收、分割品質、PyTorch 等價性或與使用者研究權重的數值一致性。沒有宣稱真實 Browser AI PASS。詳見 `VALIDATION.md`。

## Provider 與狀態契約

```js
import {BrowserAIProvider} from './provider.mjs';
const ai = new BrowserAIProvider({onProgress: console.log});
await ai.init();
await ai.setImage({width, height, data: rgbaUint8ClampedArray});
const result = await ai.predict({
  points: [{x: 0.5, y: 0.5, label: 1}, {x: 0.1, y: 0.1, label: 0}],
  box: [0.2, 0.2, 0.8, 0.8],
  mask: null // 或上次 result.lowRes，Float32Array[256*256]
});
// result.rle 是原輸入尺寸的二值遮罩；result.lowRes 是所選候選的 logits。
ai.dispose();
```

- Worker 中執行下載、SHA-256、預處理、encoder、decoder 與遮罩處理；主執行緒保留 UI。
- 只快取目前一張圖片的三組特徵，key = 尺寸 + RGBA SHA-256。相同像素可命中，不依檔名。模型存在於單一 Worker；換模型需銷毀 Worker。
- 同圖加點、負點、框選、遮罩回饋均只重跑 decoder；換圖立即提升 epoch，舊結果不能成為新圖遮罩。推論串行，queued stale request 會跳過；已提交 GPU 的工作可能仍跑完，但不套用結果。
- 停止、錯誤、逾時會關閉 Worker，釋放 session／圖片特徵。沒有瀏覽器永久圖片快取或伺服器圖片儲存。
- 正負點 `label=1/0`，框角 `2/3`；normalized x/y 各自乘 1024。RGB antialiased bilinear 拉伸到 1024×1024，ImageNet 正規化，無等比例補邊。透明像素合成白底。此 JS resize 尚未完成 PyTorch pixel parity。
- Decoder 回傳 3 組 256×256 logits；依 IoU 預測分數選擇，bilinear 放回輸入尺寸後以 `>0` 二值化。IoU 預測分數不是正確率。
- `huesense-rle-v1` 是 row-major、從背景 run 開始，可有起始零；**不是 COCO column-major RLE**。讀取前嚴格檢查格式、尺寸、整數與總長度。
- 筆刷改動二值遮罩後，回饋採 ±8 logits 並縮放到 256×256，屬啟發式修正，不宣稱等同原始模型 logits。
- 實驗頁最長邊 1200px；RLE 輸出使用該推論尺寸，`confirmed:false`。不得直接混入正式研究或原本專案 JSON。

## 靜態成果／Sites 託管

本目錄是可準備部署的靜態成果，不需要 Python 或 Docker 服務，也沒有建置框架。執行 `npm ci`、`npm run prepare:runtime` 後，以 HTTPS 靜態伺服器託管根目錄的 HTML/CSS/MJS、`vendor/` 與授權檔即可；不要發布 `node_modules/`、測試資料或任何權重。

Sites 技能的 `.openai/hosting.json` 支援靜態目錄，但沒有提供可直接驗證 Worker/CSP/WebGPU 的能力保證。對現有 URL 的程式化 HTTP 讀取回傳 403，無法取得有效的原站 CSP；不能據此斷言 Sites 不支援。環境未提供指定的 control-browser 能力，因此依 Sites 技能未啟動 preview 或另外安裝瀏覽器。本次**未重新發布線上 Sites，也未建立新部署**。

託管實際驗收條件：

- HTTPS secure context；同源 module Worker；`.mjs` 正確 JS MIME、`.wasm` 正確 WASM MIME。
- CSP 允許同源 worker／module／WASM 編譯，以及模型下載端點。實際下載可能重新導向 Hugging Face 的 Xet/CDN；須依現場 CSP/network error 檢查，不能只允許原始主機名就宣稱成功。
- 同源 ORT 檔案版本一致。使用 `numThreads=1`、`proxy=false`，沒有多執行緒 WASM 對 COOP/COEP 的需求；WebGPU 存在不表示指定模型所有算子都可用。
- `browser-test.html` 必須在目標 origin 執行；在 localhost 通過仍不能當成 Sites origin 通過。

## 未完成範圍

1. 真實瀏覽器 WebGPU 的模型編譯、記憶體上限、數值與視覺正確性尚待上述本機驗收；沒有靜默退回 WASM 或 Python。
2. 第三方 ONNX／ORT 轉換版本固定且已檢查二進位，但發布者沒有完整上游 checkpoint/export build provenance。不能認定與研究 Frozen Snapshot 相同。授權與來源紀錄见 `MODEL_SOURCES.md`。
3. 第二階段 CLIP 測試頁及 OpenCLIP parity 規格尚未開發；第三階段正式工作台整合須等 Browser Provider 驗證後才進行。
