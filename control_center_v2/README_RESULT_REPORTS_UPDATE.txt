YOYO Control Center V2.1 — Result Reports + Progress Journal Update

這次是「Control Center 本身新增功能」，所以只需要更新一次。
之後 A2 / Rebase / B1 / B2 / B3 / B4 等研究 Run 都不需要重新下載 App。

更新後固定規則：
YOYO Control Center = 長期固定安裝
Research Packages = 可持續新增
Run Results = 自動匯入
Progress Journal = 自動更新
HTML / PDF = 每次真實 Run 自動產生

每筆 Run 固定記錄：
1. Purpose（目的）
2. Process（過程）
3. Action（執行內容）
4. Result（結果）
5. Improvement（改進）
6. Next Goal（下一步目標）

報告輸出：
D:\我的雲端硬碟\畢業專題\進度文件\YOYO_RESULT_REPORTS\<run_id>\

包含：
<run_id>_RESULT.html
<run_id>_RESULT.pdf
report_manifest.json

PDF：
優先 Microsoft Edge headless print。
若找不到 Edge，再找 Google Chrome。
PDF 產生失敗不會改變研究 Gate；App 會明確顯示 PDF 未產生。

舊 Run：
不需要重跑研究。
Run Summary 內提供 Generate Report，可補產生 HTML / PDF。
