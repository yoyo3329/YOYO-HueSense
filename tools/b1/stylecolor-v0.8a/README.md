# YOYO StyleColor Extractor v0.8-A — One Chain

這是「先把完整版離線 PoC 一條龍做好，再測試」的版本。

## 完整流程

`B1 24 images → Python region proposal → region OKLab palettes → saliency / illumination evidence → existing local CLIP service (if available) → evidence-only candidates → JSON manifests → static audit.html → automatic verification`

### 重要界線

- SLIC 目前是 **Region Proposal Baseline**，不是 semantic segmentation。
- CLIP 只是一個 evidence 欄位，沒有 `clip > X = style color`。
- Shadow / highlight 只降 reliability，不刪除。
- 不做 Generic Corpus、Style Lift、NPMI、Style Graph。
- 不修改正式 `public/js/app.js`。

## CLIP

此版直接重用你原本的本地 CLIP service：

- health: `http://127.0.0.1:8765/health`
- score: `http://127.0.0.1:8765/score`
- 模型：你既有 `open_clip ViT-B-32 / openai`

Orchestrator 會把 region crop 暫時透過 `127.0.0.1:8791` 提供給 CLIP service 讀取，不需要再裝第二份 CLIP 模型。

如果 CLIP service 沒有開，`--clip auto` 仍會完成整套 pipeline，但報告會標記 `clip_status=UNAVAILABLE_SERVICE`，不會編造分數。

## 輸出

每次執行會建立新的 `runs/<timestamp>_y2k_v0_8a/`：

- `run_manifest.json`
- `source_manifest.json`
- `region_observations.json`
- `style_color_candidates.json`
- `extractor_summary.json`
- `audit_report.json`
- `audit.html`
- `source_images/`
- `previews/`
- `crops/`
- `masks/`
- `per_image/`

## Windows 一條龍

完整解壓縮後雙擊：

`INSTALL_AND_RUN_STYLECOLOR_v0.8A.cmd`

它會：
1. 安裝到 `C:\xampp\htdocs\color-search-test\tools\b1\stylecolor-v0.8a`
2. 建立本地 `.venv`
3. 安裝 base CV requirements
4. 跑 static tests
5. 直接分析你既有的 `y2k_color_mvp_b1_observations.json`
6. 自動偵測現有 CLIP service
7. 驗證輸出
8. 自動開啟最新 `audit.html`
