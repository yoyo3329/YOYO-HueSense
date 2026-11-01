# 課程 1｜五色種子查詢（MySQL 8.4）

> 本模組是獨立的 HueSense 五色資料庫測試環境。**不會修改專案根目錄的 compose.yaml、舊影像研究管線或主分支。**

## 已完成：我可以在 GitHub 自動完成的部分

1. 使用既有四張表 `hs_seed_source`、`hs_palette_seed`、`hs_palette_seed_color`、`hs_seed_color`，保留 63 組五色種子與來源資訊。
2. 建立 `scripts/query_palette_seeds.py`：輸入 `--seed-id`，以參數化 SQL JOIN 回傳五個 HEX、位置、來源、授權與原始內容 SHA-256。
3. 建立 `--list`、`--source carto|colorbrewer` 查詢模式。
4. 查詢結果檢查：恰好五個、原始位置 1–5、HEX 合法且不重複、SHA-256 與匯入時一致。
5. 追加獨立 Docker Compose（MySQL 8.4、Adminer、一次性種子匯入、查詢容器），不碰既有 Docker stack。
6. 建立單元測試及 GitHub Actions 自動檢查；沒有加入心理詞色分數、角色或 B1/B2 生成。

## 你需要在 Windows 親自完成的事情

- 安裝並啟動 Docker Desktop，確認本機 3307、8082 連接埠未被其他容器佔用。
- 建立本機密碼檔 `.env.course1`；帳號密碼只保存在你的電腦，**不可上傳 GitHub**。
- 執行 Docker／MySQL，檢查實際容器狀態、資料匯入數量與瀏覽器 Adminer。
- 在與組員共同確認之後，才合併 Pull Request；現有 v0.2 單色 SQLite 還未整合到 MySQL。

## 1. 取得分支

若已 Clone 專案，先檢查 `git status`，確認目前沒有未儲存的本地工作，再執行：

```powershell
git fetch origin
git switch feat/lesson1-seed-query-20261029
git pull --ff-only
cd research/palette_seed
```

第一次 Clone 可使用：

```powershell
git clone -b feat/lesson1-seed-query-20261029 https://github.com/yoyo3329/YOYO-HueSense.git
cd YOYO-HueSense/research/palette_seed
```

## 2. 離線測試：不需 Docker

```powershell
py scripts/check_palette_seeds.py
py -m unittest discover -s tests -v
```

預期原始資料 63 組、315 筆五色關聯、291 個不同 HEX；unittest 必須全部通過。

## 3. Windows Docker Desktop：準備密碼

在 `research/palette_seed` 目錄：

```powershell
Copy-Item seed.env.example .env.course1
notepad .env.course1
```

將 `HUESENSE_SEED_ROOT_PASSWORD` 與 `HUESENSE_DB_PASSWORD` 替換成**不同且夠強的密碼**。若 3307 或 8082 已被使用，可改設定對應連接埠。

本檔被根目錄的 `.gitignore` 規則 `.env.*` 排除；不可改名後提交明文密碼。

## 4. 啟動隔離的 MySQL 和 Adminer

```powershell
docker compose --env-file .env.course1 -f compose.course1.yaml up -d mysql adminer
docker compose --env-file .env.course1 -f compose.course1.yaml ps
```

第一次啟動空白 Volume 時，MySQL 自動執行已存在的 `sql/001_palette_seed.sql`。**後續資料表修改不會因重啟容器自動套用新的 SQL；請另做正式 migration。**

## 5. 匯入 63 組原始五色

```powershell
docker compose --env-file .env.course1 -f compose.course1.yaml run --rm --build seed-import
```

預期輸出包含：

```json
{"palettes":63,"memberships":315,"unique_colors":291,"invalid_palettes":0}
```

此匯入使用資料庫唯一鍵重複執行，可保留 palette ID 並更新該組五色。此腳本並非一般 SQL migration，也不會改寫現有影像研究資料。

## 6. 真正查詢一組五色

```powershell
docker compose --env-file .env.course1 -f compose.course1.yaml run --rm --build seed-query --seed-id carto:Peach:5
```

預期原始順序如下（不是品牌角色）：

```json
{"colors":["#FDE0C5","#F9C098","#F59E72","#F17854","#EB4A40"]}
```

完整輸出另含 `source.url`、`source.commit_sha`、`source.license`、`content_sha256`，並明確標示 `generated:false`、`roles_assigned:false`、`brand_or_psychological_validated:false`。

查詢清單：

```powershell
docker compose --env-file .env.course1 -f compose.course1.yaml run --rm seed-query --list --limit 20
docker compose --env-file .env.course1 -f compose.course1.yaml run --rm seed-query --list --source colorbrewer --limit 35
```

不存在 ID 會回傳 `NOT_FOUND`，資料不完整或 SHA-256 不一致會回傳 `INTEGRITY_ERROR`，不能假裝找到原始配色。

## 7. Adminer 人工檢查

瀏覽器開啟 http://localhost:8082

| 欄位 | 值 |
|---|---|
| 系統 | MySQL |
| 伺服器 | `mysql` |
| 使用者 | `huesense_seed` |
| 密碼 | 你自己的 `HUESENSE_DB_PASSWORD` |
| 資料庫 | `huesense_seed` |

SQL 查詢：

```sql
SELECT p.external_key, p.palette_name, sc.position_index,
       c.hex_code, s.source_url, s.license_label
FROM hs_palette_seed p
JOIN hs_palette_seed_color sc ON sc.palette_id = p.palette_id
JOIN hs_seed_color c ON c.color_id = sc.color_id
JOIN hs_seed_source s ON s.source_key = p.source_key
WHERE p.external_key = 'carto:Peach:5'
ORDER BY sc.position_index;
```

## 8. 關閉與保留資料

```powershell
docker compose --env-file .env.course1 -f compose.course1.yaml down
```

這會停止並移除容器，但保留 `seed_mysql_data` Volume。**不要使用 `down -v`**，除非你確定要刪除該測試資料庫資料。

## 驗收狀態

- GitHub 程式、SQL、來源資料：已提交到課程 1 分支，原始 63 組資料承接先前種子分支。
- 自動化單元測試：由 GitHub Actions 執行（檢查執行結果）。
- Windows Docker／MySQL 實機測試：**須由你執行，不能視為已驗收**。
- 正式單色候選 v0.2 與本種子庫合併：**尚未做**。
- A 路線數學篩選、B1／B2、角色配置、對比與 C 階段：**不是課程 1 範圍**。
