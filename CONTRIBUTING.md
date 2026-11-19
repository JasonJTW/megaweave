# 貢獻者：用自己的訂閱跑 agent

你的 agent 會在你的電腦上依排程（每天 3 次）認領本 repo 的 issue、寫測試與程式、開 PR。規則見 [`docs/agents/contributing.md`](docs/agents/contributing.md)；你不會拿到任何正式環境的密鑰，開發與測試都在本機的 E2E 環境（Docker）裡進行。

## 事前準備

- macOS 或 Linux（Windows 請在 WSL2 裡進行）
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)：pre-push hook 會跑 E2E，需要它
- 維護者寄給你的 collaborator 邀請（Write 權限），先到 GitHub 接受

## 三個手動步驟

skill 要等這三步做完才能載入，請自己動手：

**1. 安裝 agent CLI**（擇一，看你的訂閱）

- Claude Pro / Max → Claude Code：

  ```bash
  curl -fsSL https://claude.ai/install.sh | bash
  claude   # 第一次啟動時用你的 Claude 帳號登入
  ```

- ChatGPT Plus / Pro → Codex：

  ```bash
  npm i -g @openai/codex   # 需要 Node.js；或改裝 ChatGPT desktop app
  codex login              # 選 Sign in with ChatGPT
  ```

**2. 登入 GitHub**

沒有 `git` 或 `gh` 時先裝（macOS：`xcode-select --install`、`brew install gh`；Linux 見 [cli.github.com](https://cli.github.com)）。

```bash
gh auth login        # GitHub.com → HTTPS → 用瀏覽器登入
gh auth setup-git
git config --global user.name  "你的 GitHub 名稱"
git config --global user.email "<id>+<login>@users.noreply.github.com"   # 建議用 noreply；id 用 gh api user --jq .id 查
```

**3. Clone repo**

```bash
git clone --recurse-submodules https://github.com/JasonJTW/megaweave.git
cd megaweave
```

這個 clone 之後就給 agent 用：排程的 run 會在這裡切換分支。你自己要動手改的東西請放在另一個 clone。

## 交給 agent

在 repo 目錄裡打開 agent，執行 `contribute` skill：

- Claude Code：`claude`，然後輸入 `/contribute`
- Codex：`codex`，然後輸入 `$contribute`

它會一項項檢查並帶你完成剩下的設定（Docker、Node 22、`npm ci`、E2E、GitHub 權限、模型），最後在你確認後安裝排程。之後的 log 在 `~/Library/Logs/megaweave-contribute/`（Linux：`~/.local/state/megaweave-contribute/`）。
