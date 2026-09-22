
# YOYO / HueSense — Physical / Perceptual Audit Lab

版本：`YOYO_PERCEPTUAL_RELATION_V1.0.0`

這是一套可直接在本機執行的「開發校準工具」。它不是正式前台，也不是已經訓練完成的人類視覺 AI。
它用 OKLab / OKLCH 與可解釋的感知規則，模擬下列判斷：

- Hue 是否同族 / 相鄰 / 不同
- Tone 是否接近
- 低彩度時 Hue 是否不可靠
- 是否出現「Tone 很像，但 Hue identity 衝突」
- 群內 Backbone 是否 STABLE / REVIEW / UNSTABLE
- 跨群 Pairwise Verdict：SAME / RELATED / REVIEW / DIFFERENT

## 1. 執行方式

需求：Node.js 18+（建議 Node 20+）

Windows：

```bat
cd yoyo_physical_audit_lab
node server.js
```

然後開瀏覽器：

`http://localhost:8787`

如果 8787 被占用：

```bat
set PORT=8899
node server.js
```

## 2. 自動儲存

只要網頁上的「每次分析自動儲存」是開啟狀態，每次按：

`執行 Physical Audit`

伺服器會自動建立：

- `data/results/<timestamp>_<id>.json`：每次完整結果
- `data/latest.json`：最後一次結果
- `data/analysis_history.jsonl`：所有分析的 append-only 歷史紀錄

因此關掉瀏覽器不會丟失已存分析。

## 3. 內建 Y2K 範例

已放入 Physical Audit 圖中的 17 個 Supported Modes、9 個 Backbone Groups：

- G1: #E1DCDA, #C4C8C9, #DFC2BB
- G2: #886D60, #817D80, #716B6D
- G3: #594841, #714D40, #615A5B
- G4: #362B2C, #2D1E1B
- G5: #BA9A93, #A29181
- G6: #130E11
- G7: #7495D7
- G8: #4B3F64
- G9: #B67CDB

可直接載入、修改或替換成其他風格。

## 4. 輸入格式

```json
{
  "profile_name": "My Style",
  "groups": [
    {
      "id": "G1",
      "label": "Group 1",
      "members": [
        {"id": "mode_01", "hex": "#E1DCDA", "role": "Core"}
      ]
    }
  ]
}
```

## 5. 這套系統現在做的是「模擬人類感知」，不是學習你

目前 engine 是 deterministic heuristic：

- sRGB → OKLab → OKLCH
- Hue reliability 隨 Chroma 降低
- Tone similarity 使用 Lightness + Chroma
- Hue / Tone 分開判斷
- 不把所有資訊壓成單一 merge threshold
- 對 tone-similar / hue-conflict 額外標記 warning

好處：可重現、可除錯、可以做 regression test。

限制：它不是經過大規模人類標註訓練的 perception model。
因此請把結果視為「自動 Physical Audit 建議」，不是美學真理。

## 6. 之後可以怎麼升級

下一版推薦加入：

1. `human_calibration.json`
   - 讓你對某些 Pair 標 SAME / RELATED / DIFFERENT / REVIEW
2. Gold Set / Regression Set
3. Algorithm v1 vs v2 一致率比較
4. Novelty / OOD detection
5. 將 YOYO B3 的 Supported Modes JSON 直接匯入
6. 把人類標註資料與 engine prediction 分開保存，避免自我污染

## 7. 檔案結構

```text
yoyo_physical_audit_lab/
├─ server.js
├─ README.md
├─ public/
│  ├─ index.html
│  ├─ app.js
│  ├─ engine.js
│  └─ style.css
└─ data/
   ├─ results/
   ├─ latest.json              (第一次分析後產生)
   └─ analysis_history.jsonl   (第一次分析後產生)
```

## 8. 適合放哪裡

如果目前專案在：

`C:\xampp\htdocs\color-search-test\`

建議放：

`C:\xampp\htdocs\color-search-test\tools\physical-audit-lab\`

但它本身不依賴 XAMPP。直接 `node server.js` 就能跑。
