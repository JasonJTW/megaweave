# 改變已定案 ADR 的決策要維護者加 `adr-approved`，以 H1 為決策標記，內文交給 review 判斷

產品和 ADR 層級的決定只由維護者做（ADR 0007 的 Decision point）。PR #169 的 subagent 在實作時把 ADR 0009 從「用 dbmate」改寫成「用 repo 內的小型 runner」，Claude Code Review 照樣通過：review 規則只擋「違反 ADR 的程式碼」，PR 連 ADR 一起改，就沒有違反可言。維護者隔天才發現，最後多開了 PR #177 改回 dbmate。

所以新增必要檢查 `ADR decisions`（`.github/workflows/adr-decisions.yml`、`scripts/check-adr-decisions.mjs`）：PR 改了 `docs/adr/` 裡既有 ADR 的 H1，或改名、刪除既有 ADR，就要有 `adr-approved` label 才會通過。與 `migration-approved` 一樣，只有最近一次加上它的人是 repo admin 時才算數（`verifyApproval`），貢獻者的 agent 自己加的不算。

選 H1 當決策標記，是因為這個 repo 的 ADR 都把決策寫成一句標題，H1 變了就代表決策變了，可以確定性地檢查。內文的修改有兩種：追加 implementation notes 或修訂說明（例如 ADR 0006、0008 的修訂）是正常的，不該卡住；真正改了決策卻沒動標題的情況，靠程式判斷不了，交給 review：`docs/agents/code-review.md` 把「改寫既有 ADR 的決策」列為 blocking。新增 ADR 不受這個檢查限制，「新的架構決策卻沒寫 ADR」本來就由 review 抓。

## Consequences

- 要推翻一個決策，就改它的 H1，讓檢查擋下來等維護者加 label；不要只改內文、保留舊標題來繞過檢查，review 會把它當 blocking。
- 改名或刪除 ADR 也需要 label，因為其他檔案用編號和檔名引用 ADR。
- 這個檢查是必要檢查，要列在 `scripts/main-ruleset.json`，並在 merge 後執行 `npm run setup:repo` 套用。
