# YOYO / HueSense — v0.8 Stage A Fresh Chroma Train16

這一步正式進入 v0.8 的 Fresh Human Train。

## 研究目的

只回答一件事：

> Chroma relation 是否能被一個簡單、泛化的模型更好地描述？

本輪不調：

- Hue
- Hue applicability
- Lightness
- Tone

## 16 題如何選

從 B3 的 53 個 physical modes 建立 fresh pair universe。

先排除本機歷史 calibration / holdout / train / validation pair，
只使用「pair identity」做 exclusion，不讀歷史答案、不讀 v0.7 prediction。

剩餘 pair 依所有 53 modes 的 Chroma empirical terciles 分成：

- LOW × LOW：4 題
- LOW × MEDIUM/HIGH：4 題
- MEDIUM × MEDIUM：4 題
- MEDIUM/HIGH × HIGH：4 題

每群用 physical-feature diversity 做 deterministic selection，
涵蓋不同 ΔC、ΔL、absolute chroma level、hue geometry，
但這些數值完全不顯示給 Human Labeler。

## Blind UI 只看得到

- 左右兩個色塊
- Chroma Relation：
  - Similar
  - Similar or Partial
  - Different
- Confidence：
  - High
  - Medium
  - Low

不顯示：

- L/C/H
- ΔC
- mode ID
- model prediction
- v0.7 failure taxonomy
- retired validation answers

## 很重要

標註期間請不要開：

`v0_8_stage_a_train_queue.json`

因為裡面有 physical numeric features。Blind Lab 已刻意隱藏。

全部 16 題完成後按：

`全部完成後下載 JSON`

會得到：

`v0_8_stage_a_train_human.json`

把這個檔案傳回 ChatGPT。

## Independent Validation

現在故意不建立。

只有等 Fresh Train 完成、Candidate fit、Candidate Freeze 之後，
才能 materialize 新的 independent validation。
