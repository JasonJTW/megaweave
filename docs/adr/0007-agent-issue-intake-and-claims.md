# Agent 只接 collaborator 開立、寫了驗收條件的 issue，認領靠 assign 後重讀

貢獻者（Contributor）用自己的 Claude 或 ChatGPT 訂閱，在本機排程跑 agent 解 issue。repo 是公開的，任何人都能開 issue 或留言，而 agent 持有 push 權限，所以 issue 內文就是 prompt injection 的入口。我們用「開立者身分」當信任邊界：agent 只接 GitHub 回報 `author_association` 為 `OWNER`／`MEMBER`／`COLLABORATOR` 的 issue（看 API 欄位，不看內文自稱），且 issue 沒有 `needs-triage`、`needs-info`、`ready-for-human`、`wontfix`，內文有「驗收條件」段落；留言只讀 collaborator 寫的。collaborator 名單由 repo admin 控制，所以邊界由人掌握。曾考慮只接維護者貼了 `ready-for-agent` 的 issue，但那讓每張 issue 都要等人工 triage；也考慮過讓 agent 自己 triage，但那等於讓不可信的內文決定 agent 要不要動手。

兩個 agent 不會重複處理同一張 issue，是靠認領（Claim）：agent 的第一個寫入動作是 assign 自己並加 `agent:claimed`，接著重讀 issue。GitHub 的 assign 不是 compare-and-set，兩個 agent 可能同時加上去，所以以 timeline 上 `assigned` 事件的先後為準，較晚的一方移除自己並退出。認領超過 24 小時沒有開 PR 就是過期認領（Stale claim），其他 agent 可以接手。每次 Agent run 先續做自己名下未完成的認領，再認領新的；做到一半的工作 push 到 WIP 分支並在 issue 留言記錄進度，因為訂閱額度用完時 run 會被中途切斷。

## Consequences

- 不要讓 agent 依 issue 內文或非 collaborator 留言決定是否動手；不要把 collaborator 權限給不信任的人，那等於讓他能指揮所有貢獻者的 agent。
- 排程時間錯開只是為了分散 review 負載，不是防止重複處理的機制；不要因此拿掉重讀步驟。
- 遇到產品或 ADR 層級的決策點，agent 停下來：在 issue 留言提出編號問題與建議答案、改標 `needs-info` 或 `ready-for-human`、釋放認領並 @ 維護者。技術實作上的選擇由 agent 自己決定。細節見 `docs/agents/contributing.md`。
