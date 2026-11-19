# PR review 由三個訂閱分擔：Claude 雙 token 輪替，加一個用 ChatGPT 登入的 Codex Review 必要檢查

原本 `Claude Code Review` 與 `Claude Security Review` 都只用維護者的 `CLAUDE_CODE_OAUTH_TOKEN`。貢獻者加入後 PR 量變多，review 的額度改由三個訂閱分擔。Claude 的兩個 review 改用 token 池：PR 編號的奇偶決定主要 token（維護者／子毅），同一個 PR 的 code review 與 security review 錯開使用不同 token；主要 token 的 run 失敗或沒有回傳判定時，用另一個 token 重跑一次。判定（`blocking`）與 run 本身成敗是分開的步驟，所以「有 blocking finding」不會觸發換 token。

另外新增必要檢查 `Codex Review`，用 Cyrus 的 ChatGPT 訂閱，同時對照 `docs/agents/code-review.md` 與 `docs/agents/security-review.md`，blocking 定義與 Claude 的 review 相同。認證用 OpenAI 文件「Maintain Codex account auth in CI/CD」的做法：`auth.json`（`auth_mode: chatgpt`）存成 secret，在 GitHub-hosted runner 上 `codex exec`，結束後用一把專用 PAT 把更新後的 `auth.json` 寫回 secret，並用 concurrency group 讓同一時間只有一個 run，避免 refresh token 互相覆蓋。沒有用 `openai/codex-action`，因為它只收 API key，花的是另計的 API 費用而不是訂閱；沒有用 Codex 官方的 GitHub code review 整合，因為它只留 review 留言、不產生 status check，ruleset 無法要求它。Codex run 失敗（auth 失效、額度用完）時，由 Claude token 池用同一份 prompt 代打，並在 log 標明代打，否則一個人的額度就能卡住所有 PR。

## Consequences

- 這三個 review workflow 用 `pull_request` 觸發，同 repo 分支的 PR 跑的是 PR 分支上的 workflow 檔，所以任何有 write 權限的 collaborator（或其 agent）都能改 workflow 讀出三個人的 token 與 `auth.json`。這是刻意接受的：write 權限只給信任的人。若要收緊，改用 `pull_request_target` 並確保 PR 程式碼只被讀取、不被執行，且必須先過 `docs/agents/security-review.md`。
- 重新命名或新增 review job 時，要同步 `scripts/main-ruleset.json` 並重跑 `npm run setup:repo`。
- `auth.json` 寫回失敗時，下一次 Codex run 會因 refresh token 失效而失敗，轉由 Claude 代打；log 出現代打時要檢查寫回用的 PAT。
- 任一 token 過期（`claude setup-token` 的 token 有效期一年）時，review 仍會靠另一個 token 通過，因此 token 失效不會自己浮現；workflow 要在換 token 時留下 warning。

## 實作備註（2026-11）

實作見 `docs/agents/review-workflows.md`。與上文不同或上文沒寫到的地方：

- **Codex 的 job 被 concurrency 擠掉時也由 Claude 代打。** `codex-auth` group 同時只留一個等待中的 run，第三個 PR 進來時，排隊中的那個會被 GitHub 取消。為了不讓它變成紅燈，`auth.json` 只在獨立的 `Codex run` job 裡使用，必要檢查 `Codex Review` 是另一個 job，Codex 沒有給出判定（失敗、被取消）就代打。
- **`CODEX_AUTH_JSON` 未設定時直接通過、不代打。** 在 Cyrus 完成設定前，不額外花維護者的 Claude 額度；`Codex Review` 也要等 secret 設好、跑過一次之後才加進 ruleset。
- **Codex 的模型先用 `gpt-6.1-sol`。** 文件上最強的是 `gpt-6.2-astra`，但它 2026-11-17 才推出，支援它的 `@openai/codex` 版本都不滿 14 天；釘的 CLI 版本夠舊後再換（workflow 裡有 TODO）。
- **Codex 的 findings 是一則 sticky 留言，不是 inline。** 這樣 job 只需要 `pull-requests: write`，不需要另外的 MCP 工具。
- **快取鍵多雜湊 `AGENTS.md`**（code review 與 Codex）：`code-review.md` 的 Conventions 引用 `AGENTS.md`，它是標準的一部分。
- **Security review 的範圍也擴大到 `.github/` 與 `scripts/`**：token 池的邏輯在 `.github/actions/` 與 `scripts/review-pool.mjs`，這些檔案碰得到 secrets。
- OpenAI 的文件建議 ChatGPT 帳號的 `auth.json` 只用在私有、受信任的環境。這個 repo 是公開的，但 fork 的 PR 拿不到 secrets，能讀到的只有本文 Consequences 已接受的 write collaborator；另外 Codex 的輸出要等 token 都 mask 之後才印到（公開的）log，引用到 token 的判定會被丟棄。
