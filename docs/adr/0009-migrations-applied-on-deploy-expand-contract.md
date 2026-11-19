# Migration 用 repo 內的小型 runner 在部署時自動套用，只允許相容舊程式碼的變更，破壞性變更要維護者核准

原本 `server/db/migrations/` 的 SQL 檔由維護者在 PR 合併後手動套用到 production，部署流程不知道哪些已經跑過，也沒有任何檢查確認 migration 與 `schema.sql` 一致（E2E 用 `schema.sql` 建庫，migration 檔從沒被執行過）。貢獻者的 agent 也會寫 migration，手動套用成了瓶頸，也會出現程式碼已部署、schema 還沒更新的空窗。改為：`schema.sql` 仍是唯一的完整 schema，migration 仍是日期命名的純 SQL 檔（`YYYY-MM-DD-slug.sql`），由 `scripts/db-migrate.sh` 依檔名順序套用，並以檔名為 key 記錄在 `schema_migrations` 表，記錄過的檔案永不重跑；`megaweaving-cicd.yaml` 的後端部署在 `docker compose up` 之前先備份資料庫，再套用尚未記錄的 migration，遇到第一個錯誤就停止並中止部署，舊版繼續運作。

最初選的是 dbmate，導入時改成 repo 內的 runner：dbmate 從檔名開頭的數字取版本號，`2026-11-12-...` 會全部撞成版本 `2026`，得把現有 13 個檔案一次改名成 `YYYYMMDDHHMMSS_slug.sql` 並加上 `-- migrate:up` 標記，而 production 正是用這些檔名手動套用的；dbmate 還要另外拉一個第三方 image 到 production 主機、把密碼組進 `DATABASE_URL`，並且用 Go driver 執行 SQL（不支援 `DELIMITER`），與 CI 檢查用的 `mysql` client 行為不同。runner 只是一個 POSIX sh script，在 `mysql:8.0` image 裡用 `mysql` client 執行每個檔案，正是 `scripts/check-db-migrations.mjs` 在 CI 套用 migration 的方式，所以 CI 驗過的檔案在部署時以相同方式執行。每個檔案包在 `START TRANSACTION … INSERT INTO schema_migrations … COMMIT` 裡：只有 DML 的檔案要嘛全部生效要嘛全部不生效；MySQL 的 DDL 會隱式 commit，含 DDL 的檔案中途失敗時，前面的語句已生效但檔案不會被記錄，runner 停在那裡由維護者處理（`docs/deployment.md`）。沒有選 Prisma：當 ORM 要改寫上百個參數化 raw SQL 查詢，只用 Prisma Migrate 又會多出第二份 schema，而且表達不了 `FULLTEXT ... WITH PARSER ngram` 這類 MySQL 特性；沒有選 Atlas 的宣告式 diff，因為 CI 已經檢查 migration 與 `schema.sql` 一致，自動產生 migration 帶來的價值不值得多一個重量級工具。

因為部署時新舊程式碼與新舊 schema 會短暫交錯，migration 必須相容於正在運作的舊程式碼（expand/contract）：只新增欄位、資料表、index。刪除、改名、改型別要拆成兩個 PR：先讓程式碼不再使用舊結構並部署，再用第二個 PR 移除。CI 偵測到 migration 含 `DROP`、`RENAME`、`MODIFY`、`CHANGE` 等破壞性語法時，除非 PR 帶有維護者核准的 label，否則 check 失敗。

## Consequences

- 改 schema 的 PR 要同時改 `schema.sql`、新增 migration 檔並標 `needs-migration`；CI 用「main 的 `schema.sql` + 本 PR 新增的 migration」與「PR 的 `schema.sql`」各建一個資料庫，dump 後必須相同。
- 帶 `needs-migration` 的 PR 可以 auto-merge；只有破壞性變更需要維護者核准。
- 部署前備份是 `scripts/backup-db.sh`：`mysqldump --single-transaction` 壓縮後保留在 EC2 主機 repo 之外的目錄（預設最新 5 份），設定 `BACKUP_S3_URI` 時另外上傳 S3；只有存在待套用的 migration 時才備份。搬到 RDS 後只換掉這個 script（改成建立 snapshot），部署流程其他部分不變。
- 自動套用預設關閉（repository variable `AUTO_MIGRATE` 不是 `true` 時部署只印 notice）。開啟前，維護者先用只讀的 `scripts/check-prod-schema.mjs` 比對 production schema 與 `schema.sql` 建出的 schema，一致才用 `scripts/baseline-db.mjs` 把現有 migration 記錄為已套用（不執行）；`schema_migrations` 不存在或是空的時，開啟後的部署會拒絕執行。
- `migration-approved` 只有在最近一次加上它的人是 repo admin 時才算數；有 triage 權限的人（包括貢獻者的 agent）自己加的 label 會被忽略。
- 本機改了 `server/db/` 時，`make e2e-up` 不會重建已存在的 MySQL volume，要先 `make e2e-reset`。
