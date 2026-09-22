# YOYO / HueSense — v0.8.1 Controlled Chroma Train16

這版修正上一版 Blind UI 的呈現環境問題。

## 為什麼要重做一組 fresh 16 題？

你已完成的 `v0_8_stage_a_train_human.json` 本身仍然有價值：

- DIRECT_HUMAN_BLIND
- 沒有 AI
- 看不到模型輸出
- 16/16 都有完整標籤

但它是上一版 UI 產生的：

- 刺激區周圍是 Light / white card
- 沒記錄 display gamut
- 沒有 5 秒 neutral adaptation
- 題間沒有 neutral interval
- 沒有 lightness-interference flag

因此它保留為：

`PILOT_ACCEPTED_BUT_NOT_FORMAL_FREEZE_EVIDENCE`

而且這 16 個 pair 已全部從新一輪排除，避免重看造成記憶偏誤。

## v0.8.1 控制

- Stimulus surround：`#777777`
- sRGB-safe OKLCH audit
- 5 秒初始中性灰適應
- 題間 600 ms 中性灰
- Swatch gap 64 px
- 無陰影 / 漸層 / 彩色邊框
- 固定 seeded Fisher–Yates presentation order
- 同一 stratum 最多連續 2 題
- 左右位置在標註前隨機並 commitment
- 記錄 CSS `color-gamut` capability、screen colorDepth、DPR、UA
- Optional：
  `亮度差異大到會干擾我判斷彩度`

## Human export

輸出：

`v0_8_1_controlled_train_human.json`

Authority：

`DIRECT_HUMAN_BLIND_CONTROLLED_PRESENTATION`

## 禁止

- 不使用 AI
- 不使用取色器 / 色碼工具
- 不先開 queue JSON 看 L/C/H
- 不修改題序
- 不提前建立 independent validation
