<!-- Mirror of Google Drive document, 2026-10-16. Read-only product planning, not Gate approval. -->
<!-- Source: https://docs.google.com/document/d/1l8Qf6JCbzntiXA8v4q0WMXW8xTnseNNf3SqqiUEpPQU/edit -->

﻿HUESENSE｜目前進度快照與接續計畫（2026-10-16）
文件級別：PRODUCT / R&D DISPLAY ONLY；不是正式研究 Gate、不是 Snapshot V2 解凍通知
藍圖：同資料夾《HUESENSE｜產品 × 研究 × 網站總藍圖》
GitHub 工作分支：feature/huesense-browser-ai-rnd


目前可確認
[VERIFIED RESEARCH REFERENCE] 2026-09-03 Y2K OpenCLIP reference benchmark：80 張，AUC=0.786，13 張 disagreement 複核（歷史 benchmark，非端到端推薦正確率）。
[VERIFIED LOCAL MODEL] 2026-10 Windows 本機 SAM2.1 Hiera Tiny checkpoint SHA256 與鎖定檔相同；CPU 模型載入成功，小狗以兩個正向點產生可見紫色遮罩，整合至 HueSense Canvas。
[IMPLEMENTED UI] 首頁視覺／42 SVG／五色角色套色／簡易收藏與匯出介面；8779 本機 SAM2 工作台可進行選區與初步局部換色。
[NOT VERIFIED] SAM2 自動點選在多類型圖片之精度、負向點／框選全流程、自然換色品質、背景像素一致性、PNG 匯出 E2E。
[NOT VERIFIED / BLOCKED BY RESEARCH] Google Images→OpenCLIP→SAM2／Authority→B1／B2→最終多組語意色票的產品級完整驗收；不得以網站模型 demo 的 PASS 代替正式研究 Gate。
[PLANNED] 具有出處的公共色票庫、圖片萃取色票、個人化偏好權重更新、流行色趨勢資料、設計師／客戶溝通方案；未來 3D 包裝與開盒互動。
[RESEARCH SAFETY] Snapshot V2 RED HOLD；Control Center Live Queue、Authority、Gate、正式自動化不變。


現在第一優先
1. 盤點各研究模組具體輸出與 Gate（不修改 Gate）。
2. 建立隔離『語意 → 多組色票 → SVG Mockup → 選擇回饋』最短產品流程。
3. 在網站建立有來源與品質標示的種子色票庫，逐步驗證個人化演算法。
4. SAM2 局部換色保持輔助；不要取代語意決策系統。
5. 每項產品進展寫入 GitHub docs/huesense-program/CURRENT_STATUS.json 與 PROGRESS_LOG.md；Control Center 僅做讀取顯示，Google Drive 記錄定期快照。


同期不得做
* 不解除 RED HOLD，不變更正式 Authority／Queue／研究 Gate。
* 不重新部署或重建已運作的三個研究 Docker 容器。
* 不把 Demo、設計提案、網路趨勢猜測寫成研究認證證據。
* 不把正式 GitHub main、PR #2、已認證備份分支直接混合合併。


本次里程碑狀態
P0 進度總藍圖及來源表：DOCUMENTED（2026-10-16），Control Center 視圖整合仍待本機部署確認。
P1 語意 → 色票 → SVG → 回饋：NOT YET E2E VERIFIED。
P2 色票庫 300 curated/algorithm seeds：PLANNED；非已生成。
P3 圖片萃取：PLANNED。
P4 偏好學習：PLANNED。
P5 趨勢追蹤：PLANNED。
P6 AI 換色工作台：PARTIAL LOCAL EVIDENCE（真實 SAM2 選區有視覺證據），不宣稱正式完整驗收。
未來 3D 包裝：BACKLOG。


狀態來源：2026-10-16 對話提供的 Windows CMD 與截圖、2026-09 研究文件、2026-10 網站 PRD、GitHub R&D 分支。
如研究資料與本文件不一致，正式權威 Gate／最新認證 Run 優先。