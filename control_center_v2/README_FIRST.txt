YOYO Control Center V2.1

這版修正 V2 最大的 UX 問題：

1. 只需要「第一次」執行一個單檔 ONE_CLICK installer。
   不用先解壓、不用把資料夾搬到 C 槽、不用找 ZIP 旁邊的 CMD。

2. 未來研究 Package 改走 Google Drive 同步 Inbox：
   D:\我的雲端硬碟\畢業專題\執行結果\YOYO_PACKAGE_INBOX

   AI 把 package 放到對應 Google Drive 雲端資料夾
   → Google Drive Desktop 自動同步到這裡
   → Control Center 自動偵測
   → 你不需要再搬檔。

3. Dashboard 結果頁恢復並加強：
   - Current Phase / Stage
   - Latest / Previous Research Run
   - 五個白話問題
   - Gate checks
   - Previous → Current Diff
   - 是否真的讓 Mainline 前進
   - Input / Output / Dataset / Formal 狀態
   - Technical JSON 預設收起

4. 啟動時標題一定顯示 V2.1。
   ONE_CLICK installer 會嘗試安全停止舊的 YOYO server.py，再啟動新版，
   避免你一直看到 V1。

5. 安裝後桌面會建立：
   YOYO Control Center V2.1.lnk

6. 第一次啟動會自動把 Control Center Self-Test 丟進同步 Inbox，
   不需要你手動搬測試 ZIP。
