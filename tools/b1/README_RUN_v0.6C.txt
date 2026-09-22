YOYO Safe Foundation v0.6C — 一條龍

把 Patch 覆蓋到：
C:\xampp\htdocs\color-search-test\tools\b1\

執行：
cd "C:\xampp\htdocs\color-search-test\tools\b1"
npm run safe:foundation

成功時應看到：
=== YOYO Safe Foundation Sprint v0.6C — Style-Agnostic Infrastructure One Chain ===
最後：
✅ Safe Foundation Sprint v0.6C PASS.

之後：
npm run status

重要：
- 不需要做人工作業。
- 不要跑 legacy calibration:build。
- Live app.js 不會被接上。
- Quiet Luxury 只建立 DATA_PENDING 空工作區，沒有假造資料。

補充：v0.6C 自我驗證會 REUSE 已在 v0.6B.1 證明過的 B1，避免重複跑圖片解碼；未來新 style 的同一支 style:pipeline 仍可在有 evaluation set + cache 時完整跑 B1。
