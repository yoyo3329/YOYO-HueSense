# START HERE — YOYO B1 / Color Profile R&D

## 現在在哪裡？
B1 → B2 → B3-A → Color Relation Graph 已完成。
20 筆 HUMAN_APPROVED_AI_ASSISTED 已正式作為 `GOLD_TRAIN_CANDIDATE` 使用。
目前已進入 **Relation Formula Candidate v0.5**。

## 先執行
```powershell
cd "C:\xampp\htdocs\color-search-test\tools\b1"
npm run status
```

## v0.5 一鍵重跑
```powershell
npm run relation:v0.5
```

這會完成：
1. Hue applicability calibration
2. Hue relation calibration
3. Tone formula sweep
4. 53 nodes / 1378 edges candidate graph
5. Train regression
6. Baseline comparison
7. 1378-edge distribution/boundary audit
8. 9-case independent Holdout queue
9. Holdout blind lab

## 目前硬限制
`20/20` 是 Train Fit，不是獨立驗證。
下一個 Gate 是 `gold_holdout_blind_lab_v0_5.html` 的 9 題真正人工 Holdout。

完整規劃：`_planning/B1_MASTER_PLAN_v0.5.md`
