# YOYO Safe Foundation Sprint v0.6A

## 為什麼先做這段
人工 Calibration 暫停，不讓它卡住專案。這一段只做不依賴人工答案、且失敗不會污染 Runtime 的工作。

## 已做
1. Deterministic pipeline integrity audit
2. B1/B2/B3-A / relation graph 結構檢查
3. Train / Holdout overlap 檢查
4. AI provenance 檢查
5. Reproducibility SHA-256 snapshot
6. Runtime Profile Bridge 純資料介面（SHADOW_ONLY）
7. Bridge contract tests：不得 block search、不得改 palette、不得帶 candidate semantic decision

## 這段不做
- 不改 `public/js/app.js`
- 不把 v0.5 Candidate 升 Production
- 不用 v0.5 Holdout 反向調 Tone
- 不宣稱 Universal
- 不做新的 Human Gold

## 人工回來後才做
- Tone ontology v0.6 人工資料
- Hue applicability boundary 人工資料
- v0.6 Candidate
- 全新 Independent Holdout

## 執行
```powershell
cd "C:\xampp\htdocs\color-search-test\tools\b1"
node .\run_safe_foundation_sprint_v0_6a.js
```
