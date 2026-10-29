# HueSense 單色研究資料庫 v1

這是新建的可重現資料庫，不是宣稱找回先前未找到的 1,085 色原始 SQLite。

## 本版資料
- XKCD Color Survey 衍生資料：949 筆英文色名／HEX，保留來源 rank 作為原始欄位，不把 rank 解讀為情緒強度。
- 五色種子：63 組、315 筆顏色位置關係；合併色碼後同一 HEX 只在 color 主表出現一次，但各來源名稱與原始紀錄仍分開保存。
- 心理研究證據與色彩—語意關聯表已建立，但目前刻意為空。沒有經核對的論文資料就不製造 warm、friendly 等分數。
- XKCD 衍生資料的授權在此版本標記為 LICENSE_REVIEW_REQUIRED；正式再散布或商用前需核實。ColorBrewer/CARTO 來源及授權註記沿用 core_five_seeds.json。

## ER Model
```text
data_source
 ├─ color_name ─ color
 ├─ color_source_record ─ color
 ├─ color_concept_evidence ─ data_source
 │    └─ color_concept_relation ─ color ─ semantic_tag
 └─ palette_seed ─ palette_seed_color ─ color
```

## 生成 SQLite
GitHub Actions workflow `.github/workflows/build-single-color-db.yml` 會建置 SQLite 並上傳 artifact：
- `HueSense_SingleColor_Research_v1.sqlite`
- `build_report.json`

本機也可用 Python 標準函式庫執行：
```powershell
py research/palette_seed/scripts/build_single_color_db.py
```

## 來源
- https://github.com/nrennie/xkcd-color-survey/blob/main/data/clean/color_ranks.csv
- ColorBrewer/CARTO 五色種子資料：`data/core_five_seeds.json`（固定來源 commit 與授權註記）。

## 範圍限制
- 不宣稱恢復了 1,085 色資料庫。
- 色名不等於色彩心理證據。
- 不把 crowd-sourced color-name rank 當成 warm、friendly 等語意分數。
- 中文翻譯或心理標籤須另記來源、語言與審核狀態。
