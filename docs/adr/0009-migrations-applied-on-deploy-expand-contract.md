# Migration 用 dbmate 在部署時自動套用，只允許相容舊程式碼的變更，破壞性變更要維護者核准

原本 `server/db/migrations/` 的 SQL 檔由維護者在 PR 合併後手動套用到 production，部署流程不知道哪些已經跑過，也沒有任何檢查確認 migration 與 `schema.sql` 一致（E2E 用 `schema.sql` 建庫，migration 檔從沒被執行過）。貢獻者的 agent 也會寫 migration，手動套用成了瓶頸，也會出現程式碼已部署、schema 還沒更新的空窗。改為：`schema.sql` 仍是唯一的完整 schema，migration 仍是日期命名的純 SQL 檔，用 dbmate 與它的 `schema_migrations` 表追蹤；`megaweaving-cicd.yaml` 的後端部署在 `docker compose up` 之前先備份資料庫，再 `dbmate up`，失敗就中止部署，舊版繼續運作。沒有選 Prisma：當 ORM 要改寫上百個參數化 raw SQL 查詢，只用 Prisma Migrate 又會多出第二份 schema，而且表達不了 `FULLTEXT ... WITH PARSER ngram` 這類 MySQL 特性；沒有選 Atlas 的宣告式 diff，因為 CI 已經檢查 migration 與 `schema.sql` 一致，自動產生 migration 帶來的價值不值得多一個重量級工具。

因為部署時新舊程式碼與新舊 schema 會短暫交錯，migration 必須相容於正在運作的舊程式碼（expand/contract）：只新增欄位、資料表、index。刪除、改名、改型別要拆成兩個 PR：先讓程式碼不再使用舊結構並部署，再用第二個 PR 移除。CI 偵測到 migration 含 `DROP`、`RENAME`、`MODIFY`、`CHANGE` 等破壞性語法時，除非 PR 帶有維護者核准的 label，否則 check 失敗。

## Consequences

- 改 schema 的 PR 要同時改 `schema.sql`、新增 migration 檔並標 `needs-migration`；CI 用「main 的 `schema.sql` + 本 PR 新增的 migration」與「PR 的 `schema.sql`」各建一個資料庫，dump 後必須相同。
- 帶 `needs-migration` 的 PR 可以 auto-merge；只有破壞性變更需要維護者核准。
- 部署前備份目前是 `mysqldump` 上傳 S3（資料庫在 EC2 的容器裡）；搬到 RDS 後改成建立 snapshot，備份步驟是獨立 script，部署流程其他部分不變。
- 導入 dbmate 前，先用只讀 script 比對 production schema 與 `schema.sql` 建出的 schema，一致才把現有 migration 標記為已套用。
- 本機改了 `server/db/` 時，`make e2e-up` 不會重建已存在的 MySQL volume，要先 `make e2e-reset`。
