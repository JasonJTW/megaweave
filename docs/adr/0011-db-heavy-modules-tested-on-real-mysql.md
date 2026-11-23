# 以 SQL 為核心的 module 用真的 MySQL 測試，不寫比對 SQL 字串的 fake

server 測試原本用 `jest.mock` 取代 `utils/db`，在 `server/src/testUtils/` 裡寫記憶體版的 MySQL。這些 fake 比對正規化後的 SQL 字串，等於把 MySQL 的語意和狀態轉移各重新實作一遍，例如 `fakeOrgWeavesDb` 用 regex 認 `UPDATE weaves SET status = '…'`。結果是：

- SQL 改一個空白，測試就壞。
- 守衛條件、交易、`FOR UPDATE` 鎖、`ON DUPLICATE KEY` 這些真正會出錯的地方，fake 測不到。
- 一個 module 的規則同時存在正式程式和 fake 兩處。

架構審查（2026-11-23）把 Weave 與外送單收成 deep module 時，改為以下做法。

**做法**
- `*.db.test.ts` 由 `npm run test:db`（`server/jest.db.config.js`）對真的 MySQL 8 執行。
- 每次執行由 `globalSetup` 用 `db/schema.sql` 加 `reference-data.sql` 重建測試庫：`schema.sql` 是唯一完整的 schema（ADR 0009）。
- 每個測試前清空非參考資料表。
- 本機連 `make dev-services` 的 dev MySQL。
- CI 的必要檢查 `Lint, typecheck, test` 加一個 MySQL service container。
- `make test`，也就是 pre-commit hook 和 CI，會跑它。連不到 MySQL 時直接失敗並提示啟動服務，不跳過：跳過會讓本機綠、CI 紅變成常態。

**範圍：以 SQL 為核心的 module**，例如 `services/weave`、`services/delivery`、`me.ts` 的讀取模型。
- 測試穿過它們的 interface 檢查真的資料列。
- 只 mock 出站的副作用：BullMQ 佇列（Redis）、站內通知、統計重算。
- route 測試只驗 HTTP 對應：參數驗證、錯誤碼、呼叫 module 的方式。做法是 mock module 的 interface，不 mock SQL。
- 有注入式依賴、外部系統才是重點的 module（例如 `PaymentService` 的 ECPay 與 Lalamove 依賴）維持注入 mock adapter。

## Considered Options

- **在 module 前定義 repository port，測試用 in-memory adapter**：in-memory adapter 就是另一份 fake 的 MySQL 語意，問題只是換個位置。
- **繼續寫 SQL fake**：上述三個問題都在。
- **SQLite 或其他嵌入式資料庫**：撐不起 schema 用到的 MySQL 特性，例如 `FULLTEXT ... WITH PARSER ngram`、trigger、`JSON` 欄位。

## Consequences

- 新寫的 SQL 測試不要再加到 `testUtils/fake*.ts`，寫成 `*.db.test.ts`。
- 既有的 fake 還被 org route 測試使用，例如 `fakeOrgWeavesDb` 上疊著 tier、handover、public display 的 fake。所以 Weave module 搬家時保留了那些 fake 比對的 SQL 文字。等這些 route 測試改成 `test:db` 後，就刪掉 fake，到時 SQL 文字也不必再凍結。
- 本機跑 `make test` 和 commit 前要先 `make dev-services`；`make dev` 已經包含它。
