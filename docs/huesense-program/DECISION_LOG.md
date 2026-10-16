# HueSense — Decision Log / 決策沿革（產品與研究邊界）

更新：2026-10-16。這份決策紀錄是產品工程決策，不是 A2 Authority / B1 B2 Gate 審核結果。

| 日期 | 決策 | 理由 | 影響 |
| --- | --- | --- | --- |
| 2026-08～09 | 語意 → 參考影像 → OpenCLIP/Vision → 視覺證據 → 色彩方向 | 避免將關鍵字直接映射為任意 HEX | Reference 與 Display 分離；模型相關分數不是色票準確率 |
| 2026-09 | A2 mask Authority / Decision Lineage 必須有證據與追溯性 | 不能把 SAM2 的所有 mask 都當作有效色彩區域 | 保留 BLOCK、歧義、版本追溯與人工稽核 |
| 2026-09 | OKLab／OKLCH 與色彩七維特徵是研究方法，不是已驗證的心理真值 | 避免方法論過度宣稱 | 配色理由保留 heuristic 標示 |
| 2026-10 | 2D 平面設計色票／SVG 是第一版主要應用場景 | 降低產品與研究的範圍複雜度 | 3D 包裝延後 |
| 2026-10 | SAM2 任意物件換色是獨立的設計溝通功能 | 已有真實小狗 mask，但不是色彩決策引擎 | 不以換色品質取代研究推薦評估 |
| 2026-10 | 增加策展／演算法／趨勢靈感色票庫、圖片取色、喜好事件 | 無使用者時仍能提供探索與累積回饋 | 初期 Git 版本化 JSON；正式資料庫／使用者系統後置 |
| 2026-10-16 | Google Drive「畢業專題／進度文件」新增 HUESENSE_PRODUCT_ROADMAP；GitHub `docs/huesense-program` 版控；Control Center 顯示唯讀產品狀態 | 分開研究 Gate／產品目標，避免破壞權威研究 | 不碰研究正式 Gate、Queue、Authority、RED HOLD |

## 必須避免的誤判

- AUC=0.786 指特定 Y2K 參考圖片 80 張的 OpenCLIP 排序測試，不是使用者配色成功率。
- 已觀察單張狗的 SAM2 mask ≠ 任意物件可靠度／負向提示／PNG 輸出 E2E 已驗證。
- 已建立 PRD／GitHub 實驗程式 ≠ 公開 Sites 已正式部署。
- PRODUCT ROADMAP 的 DOCUMENTED ≠ 研究主線 Gate PASS。
- Google Drive 藍圖在此對話內已建立；Control Center Dashboard 必須在使用者 Windows 主機選擇安裝「唯讀顯示檔」後才能看到新的 UI。GitHub 分支更新本身不會神奇地改寫現有 Docker bind mount 檔。

## 原始來源

- Google Drive master: https://docs.google.com/document/d/1Tl94oc8VP8_iePrfFc5ENnYX9FLRKgv-WgazGj7NG5c/edit
- Google Drive progress: https://docs.google.com/document/d/1l8Qf6JCbzntiXA8v4q0WMXW8xTnseNNf3SqqiUEpPQU/edit
- 研究既有 Run/Gate/Authority 仍以既有正式證據和 Code Authority 為準。
