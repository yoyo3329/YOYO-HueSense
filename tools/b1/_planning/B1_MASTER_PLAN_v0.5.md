# YOYO / HueSense — B1 / Color Profile R&D 主線規劃 v0.5

## 已完成
- Fixed Evaluation Set 24
- B1 Observation 24/24
- B2 Aggregation 53 physical modes
- B3-A Evidence / Scope / Stability
- Atomic Color Relation Graph 53 nodes / 1378 edges
- HUMAN_APPROVED_AI_ASSISTED train set 20 cases
- Relation Formula Candidate v0.5 calibration
- 1378-edge candidate rerun + boundary audit

## v0.5 Candidate 公式
### Hue applicability
- `min_chroma < 0.03` → low_chroma
- 否則 reliable
- Train 最佳 plateau 約 0.0265～0.0345

### Hue relation
- reliable 時 `ΔH <= 40°` → same_or_adjacent
- 否則 different
- Train 最佳 plateau 約 20.5°～56.5°

### Tone
1. `ΔL <= 0.06 AND ΔC <= 0.033` → similar
2. 其餘計算 `S = ΔL + 4*sqrt(ΔL*ΔC)`
3. `S >= 0.54` → different
4. 否則 similar_or_partial

Tone coarse grid 有 972 組參數達到同樣最佳 Train Fit，選值靠近最佳 plateau 中央，不採用單一脆弱極值。

## Train 結果（不是 validation）
- Hue applicability 20/20
- Reliable Hue relation 11/11
- Tone 20/20
- All 20/20

Baseline decoder 在相同 20 train cases：
- Hue applicability 17/20
- Reliable Hue relation 10/11
- Tone 5/20
- All 3/20

這只能說 Candidate 更貼合目前 Train labels，不能證明跨資料泛化。

## 1378-edge rer跑分布
- Hue reliable 820
- Hue low-chroma 558
- Hue same/adjacent 196
- Hue different 624
- Tone similar 81
- Tone partial 643
- Tone different 654

Boundary audit：
- Hue applicability 195 edges
- Hue relation 91 edges
- Tone 155 edges

Boundary 只是 Audit signal，不代表錯誤。

## 現在唯一 Gate：Independent Holdout
已自動建立 9 題 stratified boundary holdout：
- 3 Hue applicability
- 3 Hue relation
- 3 Tone
- 完全排除目前 20 train pairs

請只用 `gold_holdout_blind_lab_v0_5.html` 人工判斷；不可讓 AI 代答、不可看數值與 candidate prediction。

完成後：
```powershell
npm run holdout:check
```

## Holdout 之後
### 若通過
→ 凍結 candidate v0.5
→ 第二風格 Cross-style sanity test
→ Multi-view Profile Builder
→ Runtime Profile Bridge / Shadow Audit

### 若不通過
只根據 Holdout 的 failure pattern 修 v0.6；不可把 Holdout 反覆拿來調到 100%，避免 Holdout 變成第二個 Train。
