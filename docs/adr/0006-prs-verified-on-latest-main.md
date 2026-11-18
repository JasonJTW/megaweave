# PR 一定要在最新的 main 上通過檢查才合併，落後時由 workflow 自動合入 main

`main` 的 ruleset 開啟「Require branches to be up to date」（`strict_required_status_checks_policy: true`）：PR 落後 main 時不能合併，必須先合入最新的 main，再重跑 E2E 與所有 review。這樣兩個各自通過的 PR 不會在 main 上組合出沒驗證過的狀態。代價是每次 main 前進，其他 PR 都要重跑一輪檢查，這是刻意接受的。

**修訂（2026-11）**：review 改由三個訂閱分擔（ADR 0008）之後，「每次 main 前進就重跑所有 review」的費用落在貢獻者的訂閱額度上，而且會隨開著的 PR 數量倍增。review 讀的是 PR 自己的 diff，diff 沒變時重跑不會得出新結論；驗證「與最新 main 組合後會不會壞」的是 E2E。所以 review 的判定以 PR 相對 merge-base 的 diff 雜湊快取：雜湊與上次通過 review 時相同，就沿用上次的判定，不再呼叫模型；E2E 照舊在每次合入 main 後重跑。

GitHub 的 merge queue 能做到同樣的事而且會排隊，但只開放給 organization 擁有的 repo，這個 repo 掛在個人帳號下，所以改用 `.github/workflows/update-auto-merge-branches.yml`：main 每次被 push，或有 PR 開啟 auto-merge 時，就對所有開了 auto-merge、非草稿、同 repo 的 PR 執行 `gh pr update-branch`。開啟 auto-merge 也要觸發，因為在 main 最後一次 push 之後才開的 PR 一開始就落後，只靠 push 觸發的話，要等到 main 下一次移動才會被更新。這個觸發用 `pull_request_target`，執行的是 main 上的 workflow 定義，PR 改不到持有 token 的 job；job 不 checkout PR 程式碼，也不讀 PR 可控制的文字。它用 `AUTO_UPDATE_TOKEN`（只限這個 repo 的 fine-grained PAT，Contents／Pull requests／Workflows 讀寫）推送，因為用 `GITHUB_TOKEN` 推的 commit 不會觸發新的 workflow，必要檢查不會重跑，auto-merge 會永遠卡住。

分支規則只放在 ruleset（`scripts/main-ruleset.json`）。`scripts/setup-repo.sh` 會在確認 ruleset 已生效後刪掉舊式 branch protection，避免兩套規則疊加、而 repo 裡看不到其中一套。

## Consequences

- 不要把 `strict_required_status_checks_policy` 改回 `false`，也不要用 `GITHUB_TOKEN` 取代 `AUTO_UPDATE_TOKEN`。
- 不要把 review 的快取鍵改成 head commit：合入 main 會產生新 commit，快取就永遠不會命中。也不要快取 E2E。
- 多個 PR 同時開 auto-merge 時會一起被更新，先通過的先合，其餘再被更新一次；會多跑幾輪檢查，但不需要人介入。
- 跟 main 有衝突的 PR 不會被更新（workflow 只留 warning），需要手動合入 main。
- `AUTO_UPDATE_TOKEN` 過期或被撤銷時，workflow 會留下 warning 並略過，PR 落後時又要手動按「Update branch」。
- repo 若移到 organization，可以改用 merge queue（required workflow 要加 `merge_group` 觸發），並移除這個 workflow。
