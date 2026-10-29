# 技術差異分析：組織分層釋出

- 對應 PRD：`docs/prd/0001-org-tiered-exchange.md`
- 日期：2026-10-28
- 狀態：Draft（僅盤點，未定案）

## 核心設計決策

1. **全站單一帳號**：使用者不分租戶，透過「組織成員資格」取得 Tier 1／Tier 2 權限。公開平台維持不變。
2. **貼文帶可見範圍**：`posts` 多一個 `audience_tier`，可升可降；沒有已核准的 Weave 時才能降級。沒有組織的貼文等同 Tier 3（現有行為）。
3. **物品屬於單位，不屬於個人**：`posts.user_id` 保留為「經手人」，另加 `org_unit_id` 表示擁有者。

## 現況 → 需要的改動

### 1. 組織與成員（E1）

| 現況 | 改動 |
|---|---|
| 沒有組織概念 | 新表 `organizations`（名稱、允許網域、設定）、`org_units`、`org_memberships`（user、org、unit、成員類型：職員／學生、組織角色：admin／unit_staff／member、`verified_at`） |
| `users.role` 是全站角色（user／admin／contributor），`requireRole` 只看全站角色 | 保留全站角色當平台管理員；新增 `requireOrgRole(orgId, roles)` middleware |
| 無 email 驗證流程，`users` 無驗證欄位 | 新增組織 email 驗證（token 表＋Resend 寄信 job）。組織 email 可與登入 email 不同，存在 membership 上 |

### 2. 可見範圍過濾（E2、E5）— 風險最高

| 現況 | 改動 |
|---|---|
| `posts` 無可見範圍；15 個檔案、約 39 處 SQL 直接讀 `posts` | 加 `org_id`、`org_unit_id`、`audience_tier`；建立共用的「可見性條件」helper，所有讀取路徑改用它 |
| `feedService` 的 `whereClause` | 加可見性條件（公開 OR 我所屬組織且層級允許） |
| Redis `feed:trending` 全站共用 | 公開排行只收 Tier 3；組織內排行另開 `feed:trending:org:{orgId}` 或直接查 MySQL（組織量小） |
| 向量索引 `idx:posts_v` | 加 `org_id`、`audience_tier` TAG 欄位，FT.SEARCH 帶過濾 |
| `hotScore` cron | 依層級寫入對應排行 |
| 貼文詳情、留言、按讚、私訊、Socket 通知 | 讀寫前檢查可見性 |
| `weaves.ts` 送出請求 | 檢查認領者是否符合目前層級（E5-1）；之後加認領數量限制（E5-2） |
| 前端 `generateMetadata`、分享連結 | 非公開貼文不輸出 OG 內容、加 noindex |
| `userVector` 興趣學習 | 確認不會把非公開貼文推給不符合資格的人 |

新表 `post_tier_events`：記錄升降級（誰、何時、從哪層到哪層）。自動升級（E2-3）用 BullMQ 排程 job。

降級（E2-6）要在同一個交易中完成，並在交易後清快取：
- 檢查沒有 `approved`／`completed` 的 Weave，否則拒絕
- 不符合新層級資格的 `requested` Weave 改為 `declined`，並通知對方
- 清除 Redis 貼文快取、從公開 `feed:trending` 移除、更新向量索引的 `scope` TAG
- 前端貼文頁若有快取，一併 revalidate

升級到 `public` 延遲生效（E2-7）：`posts` 加 `pending_tier`、`pending_tier_at`，用 BullMQ delayed job 在到期時套用；取消時清掉欄位並移除 job。job 執行時要重新檢查 `pending_tier` 仍存在，避免取消與到期同時發生。

### 3. 單位上架與總覽（E3、E8）

| 現況 | 改動 |
|---|---|
| 貼文只屬於個人 | 上架時可選「代表單位」，寫入 `org_unit_id` |
| 無組織總覽 | 組織管理員清單 API＋頁面（篩選單位、層級、狀態） |
| 窗口離職無處理 | 單位物品與進行中的 Weave 可轉給新窗口 |
| `admin.ts` 只有 metrics 與佔位用的 cleanup | 新的 `orgAdmin` 路由群組 |

### 4. 財產合規（E4）

- `items` 加 `asset_tag`（財產編號）
- `posts` 加 `disposal_confirmed_at`／`disposal_confirmed_by`；有財產編號的貼文升到 Tier 3 前必須已確認

### 4.5 物品流轉紀錄（E9）

- 時間軸由既有資料組出，不另存一份：上架（`posts`）、層級變更（`post_tier_events`）、申請／核可／完成（`weaves` 狀態與時間）、操作者（`org_audit_logs`）
- `weaves` 目前只有 `completed_at`，需補各狀態轉換時間（或統一寫入事件表），時間軸才完整
- 紀錄唯讀，只有平台管理員能修正
- CSV 匯出（依期間、單位），欄位依試點學校總務需求定案

### 5. 報表（E6）

| 現況 | 改動 |
|---|---|
| `user_stats` 只有個人統計，`items` 只有 `title`、`quantity` | `items` 加估算重量、估算價值 |
| `categories` 無排放資訊 | `categories` 加預設重量與排放係數（需註明來源） |
| 無組織統計 | 組織報表 API：件數、各層去化率、各單位統計、CO2e 估算；CSV 匯出 |

### 6. 批量（E7）

- CSV 批次上架：走 BullMQ（圖片、embedding 本來就在 queue）
- 批次升級 API

### 7. 其他

- 稽核紀錄表 `org_audit_logs`（E8-2）
- 新錯誤碼加入 `errorCodes.ts`，並補 client 兩種語系翻譯
- 新名詞（Organization、Org Unit、Tier、Release）寫入 `CONTEXT.md`
- 「全站單一帳號＋可見範圍」決策見 `docs/adr/0003-org-membership-and-audience-tier.md`

## 不需要改的

- 公開平台既有功能與資料（皆視為 Tier 3）
- Weave 狀態機（`requested → approved → completed`）可直接沿用
- 部署架構（同一套 MySQL／Redis／S3）
- ECPay、Lalamove（先不對組織物品開放）

## 建議實作順序

1. **地基**：組織／單位／成員表、email 驗證、`requireOrgRole`
2. **可見性**：`audience_tier`＋共用 helper＋所有讀取路徑＋隔離測試（獨立 PR）
3. **試點功能**：單位上架、手動升級、組織總覽、認領資格檢查、基本統計
4. **加值**：自動升級、財產確認、CO2e 報表、CSV 匯入匯出、稽核紀錄
