<!-- Mirror of Google Drive document, 2026-10-16. Read-only product planning, not Gate approval. -->
<!-- Source: https://docs.google.com/document/d/1Tl94oc8VP8_iePrfFc5ENnYX9FLRKgv-WgazGj7NG5c/edit -->

﻿HUESENSE｜產品 × 研究 × 網站總藍圖（MASTER BLUEPRINT）
版本：2026-10-16 / V1.0
文件定位：產品規畫與研究進度說明；非研究 Gate 證書，非正式部署授權
檔案位置：我的雲端硬碟／畢業專題／進度文件／HUESENSE_PRODUCT_ROADMAP
GitHub 對應：yoyo3329/YOYO-HueSense；開發分支 feature/huesense-browser-ai-rnd
研究程式權威路徑：D:\docker\color-search-test
研究持久資料：D:\YOYO_DATA
歷史稽核／Run／Checkpoint：保留原本 YOYO_RESULT_REPORTS／YOYO_CHECKPOINTS／YOYO_COLOR_EVIDENCE_AUDITS，絕不搬移或覆蓋。


【A｜核心使命｜WHY】
HueSense 的研究核心是「語意驅動的個人化色彩決策支援系統」，不是 AI 換色網站。設計師或客戶輸入描述／風格感受，系統從有來源的視覺參考建立語意與色彩證據，轉換成具角色關係的多組候選色票；使用者再選擇、修改、回饋，讓推薦能逐步適應個人偏好。優先服務平面設計／視覺傳達：海報、品牌視覺、平面包裝與產品圖片。3D 互動包裝與開盒展示屬長期擴充。


【B｜三個互補的功能層】
L1 研究核心／Semantic Color Intelligence：
語意需求 → Concept Taxonomy / Profile → Reference Discovery（既有 SerpApi Google Images）→ OpenCLIP 語意候選排序 → 可選擇的深度視覺判讀 → SAM2 主體／背景候選區域 → Authority / Gate 准入 → OKLab／OKLCH 色彩量測 → 可追溯跨圖片聚合 → A/B/C 多組配色候選與理由 → 偏好更新（獨立驗證）。
「Google Images 搜尋結果」不是實際語意符合的證明；「OpenCLIP 分數」不是色彩準確率；「SAM2 mask」不是自動有效的色彩證據。
L2 色票探索／Palette Library：
預設策展色票、演算法配色、具有來源的趨勢靈感色票、圖片／藝術作品上傳萃取色票；每組具有背景、主色、輔色、強調色、文字色等色彩角色，並能直接套用既有 SVG 平面設計範本。
L3 溝通預覽／Design Communication：
局部 SAM2 點選分割／修正／簡易換色、原圖對照、A/B/C 比較與輸出。換色只用於幫助設計師與客戶討論；不取代 L1 語意推薦研究。


【C｜歷史研究決策與證據】
2026-09 Y2K v1.1：SerpApi Google Images 參考集 80 張，正式 OpenCLIP benchmark AUC 0.786；13 張 disagreement 人工複核。此數據證明特定 benchmark 的排序能力，不是整個色票推薦端到端準確率。
Reference Pool（研究資料）與 Display Pool（具適當展示授權的內容）分開；不得直接大量複製外部網站配色／圖片冒充本站原創。
Decision Lineage / Authority Audit：檢查 A2 遮罩身份、准入理由、19 個 AMBIGUOUS blocker 等歷史問題；舊結果須依對應 Run／revision 校對，不將工程重製等於正式政策放行。既有 Snapshot V2 RED HOLD／NO_LIVE_MUTATION，Control Center Live Authority／Queue／Gate 不可因本文件更新而改變。
色彩方法曾規畫 OKLab／OKLCH、相對亮度／WCAG、感受詞七維特徵（明度、色度、冷暖、對比、視覺重量、中性色比例、深色比例）。這些感受詞係經驗性研究特徵，不能聲稱為有心理實驗驗證的普遍真理。
網站歷史：已有可用首頁與 42 個 SVG 範本、五色角色、少量內建 PRESETS、簡易 SHUFFLE、SVG 套色與作品收藏；缺乏真正有來源的公共色票 DB、長期個人化推薦、趨勢更新。
2026-10 本機 SAM2.1：已驗證 checkpoint SHA-256、Windows CPU 模型載入成功，並在 HueSense Canvas 觀察到以兩個正向點產生小狗紫色分割遮罩。染成粉紅色的小狗可視覺展示初步換色，但自然度不足；PNG 匯出與背景像素一致性尚未形成正式端到端驗收報告。新 local studio 是實驗，非研究 Gate PASS，非公開 Sites 上線。


【D｜整合產品使用流程】
入口 1：語意探索 → 顯示候選參考與來源 → 多組可解釋配色 → 套用海報 → 喜歡／修改／比較／匯出。
入口 2：圖片取色 → 上傳攝影／畫作 → 全圖或 SAM2 局部萃取 → 依原圖的取色方案／演算法延伸 → 套用與回饋。圖片的著作權與使用權由使用者確認。
入口 3：色票庫 → 探索編輯精選／演算法／趨勢靈感 → 關鍵字、冷暖、彩度、對比、年代／設計風格篩選 → 直接套用 42 個 SVG → 收藏。
入口 4：設計預覽 → 已產生的色票套用於 2D Mockup 與指定局部區域 → 比較並分享方案。正式 3D 包裝與互動開盒後置。


【E｜資料模型與顯示責任】
palette：palette_id（穩定 ID）、colors[五角色 HEX]、OKLCH 特徵、tags／semantic concepts、algorithm_version、created_at、review_state。
palette_provenance：palette_id、origin=[CURATED／ALGORITHM／SEMANTIC_EVIDENCE／IMAGE_EXTRACT／TREND_INSPIRED]、source_url／source_license／reference_run_id（可為空）、editorial_note。
trend_signal：來源、觀測時間、描述、官方發布與否、有效期、權利限制；只有有證據的資料才標示『趨勢』，不能虛構熱門／按讚數。
preference_event：匿名或有授權使用者 ID、事件類型 LIKE／DISLIKE／SAVE／APPLY／EDIT、palette_id、timestamp、同意用途。
experiment_link：研發分支／commit／模型版本／真實照片測試狀態；與正式研究 Gate ID 保持區別。
Reference 搜尋供研究使用、對外展示授權需獨立審查；圖片本身不因分析而取得任意再散布權。


【F｜下一階段里程碑（推薦次序）】
P0｜盤點與整合契約：建立來源—模組—Gate—網站功能對照矩陣；核對最新研究版本與實際可用輸出；禁止把 RED HOLD 改成 PASS。完成條件：可一鍵查到各模組『已驗證／待驗證／規畫』證據與 owner。
P1｜SEMANTIC-TO-PALETTE MVP（最高優先）：在隔離研發環境完成一個風格 prompt（先 Y2K），可呈現 3 組配色（各有來源、HEX、角色、理由、對比檢查），套入 42 SVG 中至少三款，完成 A/B/C 比較。明確標注研究級與 demo 級資料，不能假裝正式 B2 已解除 HOLD。
P2｜PALLETTE LIBRARY：策展／演算法／趨勢靈感的初始 300 左右色票品質檢查與標示；先使用 Git 版本化 JSON 供網站讀取，確認需求後再建立 Supabase／PostgreSQL。需審核授權、去重、可讀性與配色角色。
P3｜IMAGE-TO-PALETTE：照片萃取、全圖與指定 mask 取色、原圖代表色／演算法延伸、套用與分享；至少三種素材實測。
P4｜PREFERENCE LEARNING：用明確的 LIKE／DISLIKE／選擇／修改事件更新排序，不必重新訓練 SAM2 或 OpenCLIP；採離線重播評估及使用者研究，避免『學習』只有收藏數量。
P5｜TREND WATCH：每月／季度記錄有日期與來源的色彩／設計趨勢；區分官方報告、編輯策展、站內真實熱門，禁止偽造熱度或未經授權擷取 Color Hunt。
P6｜DESIGN COMMUNICATION：改善自然換色、PNG 與專案匯出驗證、溝通評論與設計提案。
FUTURE｜3D PACKAGING：3D 套色、材質、旋轉與開盒互動；後置於 2D 平面產品與決策研究成功後。


【G｜兩種進度，不要混淆】
RESEARCH GATE：由 Control Center 現有權威資料／Run／Approval 決定，受 RED HOLD 限制，本文件永遠不寫入。
PRODUCT ROADMAP：由產品團隊審核之里程碑、網站功能與使用者測試結果，允許在獨立進度資料夾更新。
兩者可同頁對照，但不能計算成同一個百分比。Control Center 只能額外增加 PRODUCT / R&D DISPLAY ONLY 面板，不得偽造研究 PASS 或開啟套件執行。


【H｜同步與版本治理】
Google Drive 老位置：畢業專題／進度文件／HUESENSE_PRODUCT_ROADMAP（本文件＋CURRENT_PROGRESS）。
GitHub canonical source：docs/huesense-program/{BLUEPRINT.md,CURRENT_STATUS.json,DECISION_LOG.md,PROGRESS_LOG.md} on feature/huesense-browser-ai-rnd；版本化、可追溯。
Control Center：唯讀顯示上列 repo 進度快照、來源連結、更新日期；有網路時可週期擷取公開 GitHub branch JSON，失敗顯示 STALE，不改既有研究狀態。
Google Drive 文件同步需要明確編輯動作或經批准的排程；不能只因 GitHub commit 就宣稱 Drive 已自動更新。
每一項變更保留 date、commit、status、evidence、next_action，不把想法誤認作已實作。


【I｜風險、開發邊界與回顧週期】
正式 docker/control-center 程式權威工作樹 D:\docker\color-search-test；研究持久資料 D:\YOYO_DATA；Google Drive 保存結果、藍圖、歷史，**不是 Runtime DB**。不得碰 PR #2／main／官方 Sites／Control Center Authority／Queue／Gate／Phase2 frozen／Snapshot V2 RED HOLD。
研發分支 feature/huesense-browser-ai-rnd 的網站＋SAM2 工作台成果，須以獨立驗收進入主線。
每週專案回顧：對照完成證據與需求，調整 PRODUCT ROADMAP；每月顯示趨勢資料來源；研究 Gate 僅受正式稽核流程控制。