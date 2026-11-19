# Agent 只接 collaborator 開立、寫了驗收條件的 issue，認領靠 assign 後重讀

貢獻者（Contributor）用自己的 Claude 或 ChatGPT 訂閱，在本機排程跑 agent 解 issue。repo 是公開的，任何人都能開 issue 或留言，而 agent 持有 push 權限，所以 issue 內文就是 prompt injection 的入口。我們用「開立者身分」當信任邊界：agent 只接 GitHub 回報 `author_association` 為 `OWNER`／`MEMBER`／`COLLABORATOR` 的 issue（看 API 欄位，不看內文自稱），且 issue 沒有 `needs-triage`、`needs-info`、`ready-for-human`、`wontfix`，內文有「驗收條件」段落；留言只讀 collaborator 寫的。collaborator 名單由 repo admin 控制，所以邊界由人掌握。曾考慮只接維護者貼了 `ready-for-agent` 的 issue，但那讓每張 issue 都要等人工 triage；也考慮過讓 agent 自己 triage，但那等於讓不可信的內文決定 agent 要不要動手。

兩個 agent 不會重複處理同一張 issue，是靠認領（Claim）：agent 的第一個寫入動作是 assign 自己並加 `agent:claimed`，接著重讀 issue。GitHub 的 assign 不是 compare-and-set，兩個 agent 可能同時加上去，所以以 timeline 上 `assigned` 事件的先後為準，較晚的一方移除自己並退出。認領超過 24 小時沒有開 PR 就是過期認領（Stale claim），其他 agent 可以接手。每次 Agent run 先續做自己名下未完成的認領，再認領新的；做到一半的工作 push 到 WIP 分支並在 issue 留言記錄進度，因為訂閱額度用完時 run 會被中途切斷。

## Consequences

- 不要讓 agent 依 issue 內文或非 collaborator 留言決定是否動手；不要把 collaborator 權限給不信任的人，那等於讓他能指揮所有貢獻者的 agent。
- 排程時間錯開只是為了分散 review 負載，不是防止重複處理的機制；不要因此拿掉重讀步驟。
- 遇到產品或 ADR 層級的決策點，agent 停下來：在 issue 留言提出編號問題與建議答案、改標 `needs-info` 或 `ready-for-human`、釋放認領並 @ 維護者。技術實作上的選擇由 agent 自己決定。細節見 `docs/agents/contributing.md`。

## 實作備註（2026-11）

實作是 `contribute` skill（`.agents/skills/contribute/`，Claude Code 經 `.claude/skills/contribute/` 讀到同一份）。挑選、認領、timeline 比對與容量計算寫在 `scripts/agent.mjs`，不讓 agent 每次自己重寫。與上文不同或上文沒寫到的地方：

- **有 assignee 的 issue 不接**（除非是過期認領），**有未關閉 blocker 的也不接**。有人被 assign 代表有人在做，即使沒有 `agent:claimed`。
- **接手過期認領時先移除原 assignee 再 assign 自己**，否則 timeline 比對永遠判原持有者勝。
- **「完成」的認領**：PR 開著、不是 draft、已開 auto-merge、沒有失敗的 check、沒有衝突。不符合就算未完成，下一次 run 先續做；PR 被關掉沒合併時當作決策點（`ready-for-human`）。
- **分支名 `agent/<login>/<issue>-<slug>`**，PR 內文一行 `Model: <id>`、每個 commit 帶 `Model: <id>` trailer。`Lint, typecheck, test` 對 `agent/` 分支檢查模型在 `scripts/agent-models.json`（從 base 讀）裡，不用改 ruleset。
- **排程用系統的 launchd／cron 呼叫 `run.sh`**，模型、effort 與 permission mode 寫死在指令上；Claude Code 用 auto mode，Codex 用 `--approve-for-me`。ChatGPT desktop app 的 Scheduled task 可用，但模型沒有釘在指令裡。
