# Megaweaving Translate

# megaweaving.net 全站 UI 關鍵字與表單英翻中對照表

本文件包含透過自動化工具爬取 `megaweaving.net`（包含公開頁面、登入後後台、`Categories` 下拉選單、`+Wish / +Share` 彈出表單及 `/user` 個人設定頁面）所整理出的完整 UI 關鍵字與建議翻譯對照表。

---

## 1. 登入與註冊頁面 (Signin & Authentication Form)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Login Form Tab | `Log in` | 登入 | Form Tab |
| Register Form Tab | `Register` | 註冊 | Form Tab |
| Third-party Auth | `Log in with Google` | 使用 Google 帳戶登入 | Button |
| Third-party Auth | `Log in with Facebook` | 使用 Facebook 帳戶登入 | Button |
| Divider Text | `or` | 或 | Text |
| Input Label | `Email` | 電子郵件 | Form Label |
| Input Placeholder | `Enter your email` | 請輸入您的電子郵件 | Placeholder |
| Input Label | `Password` | 密碼 | Form Label |
| Input Placeholder | `Enter your password` | 請輸入您的密碼 | Placeholder |
| Checkbox Label | `Remember me` | 記住我的登入資訊 | Checkbox |
| Action Button | `Log in` | 登入 | Primary Button |
| Form Link | `Forget password?` | 忘記密碼？ | Text Link |

---

## 2. 頂部導覽列與選單 (Header & Navigation)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Brand Logo | `megaweaving` | ~~megaweaving (品牌名)~~ | Logo Text |
| Header Action | `Messages` | 收件夾 | Nav Item |
| Header Action | `Notifications` | 通知 | Nav Item |
| Mobile Accessibility | `Open menu` | 開啟主選單 | Accessibility Label |
| Post Action Button |   `• Wish` |   • 許願 | Action Button |
| Post Action Button |   `• Share` |   • 分享 | Action Button |
| Feature Teaser |   `• Common Share` |   *•* 地球公物 | Feature Label |
| Status Badge | `Coming soon` | 即將推出 | Badge |

---

## 3. 首頁搜尋與篩選列 (Home & Search Filter Bar)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Search Input | `Search` | 搜尋物品或關鍵字... | Input Placeholder |
| Category Dropdown | `Categories` | 資源分類 | Filter Dropdown |
| Location Input | `Location` | 選擇地區/縣市 | Filter Input |
| Filter Button | `Wish Only` | 僅看許願 | Toggle Filter |
| Filter Button | `Share Only` | 僅看分享 | Toggle Filter |
| Filter Button | `Hide Overdue` | 隱藏已過期/已結束 | Toggle Filter |
| Banner Title | `Let's start weaving !` | 開始大量交織！ | Hero Heading |
| Category Tag | `Home & Living` | 居家生活 | Category Tag |
| Category Tag | `Others` | 其他雜項 | Category Tag |

---

## 4. 分類下拉選單 (Categories Dropdown Options)

| 選單項目 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 說明 (Context) |
| --- | --- | --- |
| `Home & Living` | 居家生活 | Category Option |
| `Appliances` | 電器用品 | Category Option |
| `Audio & Games` | 影音與遊戲 | Category Option |
| `Books & Crafts` | 書籍與手作 | Category Option |
| `Electronics` | 3C 電子 | Category Option |
| `Fashion` | 服飾美妝 | Category Option |
| `Kids & Baby` | 嬰幼用品 | Category Option |
| `Materials` | 原物料與材料 | Category Option |
| `Pets` | 寵物用品 | Category Option |
| `Others` | 其他 | Category Option |

---

## 5. 新手引導與平台介紹彈窗 (Onboarding & Welcome Modal)

本導覽共 **6 個步驟**，使用者可點擊畫面或左右滑動切換，右上角 × 可隨時關閉。

### Step 1 — Welcome（歡迎介紹）`layoutType: welcome`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Body Text (Line 1) | `megaweaving is a platform for resources sharing and circulation.` | 大量交織megaweaving 是一個促進資源共享與循環的平台。 | Headline / Body |
| Body Text (Line 2) | `The concept of "weaving" allows users to exchange resources for free, creating a cycle that maximizes resource efficiency through collective sharing.` | 「weaving」的概念讓使用者能免費交換資源，透過群體共享創造循環，最大化資源利用效率。 | Description |
| Body Text (Line 3) | `By "weave" user with those who "share" or "wish", we foster sustainability and strengthen community bonds.` | 透過將「許願者」與「分享者」連結編織在一起，我們共同推動永續發展並凝聚社群與人的連結。 | Description |

### Step 2 — Wish Button Spotlight（許願按鈕聚焦）`layoutType: wish`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Tooltip Body | `Post a request for specific resources you are looking for.` | 發布您正在尋找的特定資源需求。 | Tooltip Body |
| Target Element |   `• Wish` (header button, `id="tour-wish"`) |   • 許願 | Button Label |

### Step 3 — Share Button Spotlight（分享按鈕聚焦）`layoutType: share`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Tooltip Body | `List resources you want to give away to the community.` | 發布您想要分享給社群的資源。 | Tooltip Body |
| Target Element |   `• Share` (header button, `id="tour-share"`) |   • 分享 | Button Label |

### Step 4 — Scroll Hint（滾動提示）`layoutType: scroll`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Hint Text | `Scroll vertical to browse.` | 向下滾動以瀏覽貼文。 | Instruction |
| Animation | *(手形圖示上下浮動，搭配垂直虛線)* | *(手形圖示動畫)* | Visual Element |
| Target Element | Feed area (`id="tour-feed"`) | 貼文列表區 | Target |

### Step 5 — Rules（平台規則）`layoutType: rules`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Rule Text (Line 1) | `Free resources only.` | 僅限免費資源分享。 | Rule Statement |
| Rule Text (Line 2, highlighted) | `No monetary transactions` | 不涉及金錢交易 | Rule Warning (紅色醒目) |
| Rule Text (Line 3) | `or trades involved.` | 或任何有條件換物。 | Rule Statement |

### Step 6 — Private Message（私訊功能說明）`layoutType: message`

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Instruction | `Click [私訊圖示] button to send a private message and request weaving with the owner of the post.` | 點擊 [私訊圖示] 按鈕，向貼文的擁有者發送私訊並發起 weaving 邀請。 | Instruction |
| Target Element | Private Message icon button (`id="tour-message"`) | 私訊圖示按鈕 | Button |

### 通用 UI（所有步驟共用）

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Close Button (`aria-label`) | `Close tour` | 關閉導覽 | Accessibility Label |
| Overlay (`aria-label`) | `Proceed to next tour step` | 下一步 | Accessibility Label |
| Bottom Dots | *(進度圓點，共 6 個)* | *(進度指示點)* | Progress Indicator |

---

## 5-a. 貼文表單 — Post Form Modal（`+ Share` / `+ Wish` 彈出表單）

點擊頂部導覽列的 `+ Share` 或 `+ Wish` 按鈕後彈出的全頁表單。表單標題（`title` prop）直接使用貼文類型字串，大寫化後顯示為 **`share`** 或 **`wish`**。

### 表單標題與操作按鈕

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Modal Title (Share) | `share` | 分享 | Modal Heading |
| Modal Title (Wish) | `wish` | 許願 | Modal Heading |
| Submit Button | `Post` | 發布 | Primary Button |
| Submit Button (loading) | `Processing...` | 處理中… | Loading State |
| Close Button | *(× 圖示)* | 關閉 | Icon Button |
| Add Image Button | *(+ 圖示)* | 新增圖片 | Icon Button |

### 表單欄位（Form Fields）

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Category Dropdown | `Category` (placeholder) | 資源分類 | Dropdown Placeholder |
| Condition Dropdown | `Condition` (placeholder) | 資源狀況 | Dropdown Placeholder |
| Title Input | `Title` (placeholder) | 標題 | Input Placeholder |
| Hashtag Input | `e.g. #poster #TABF` | 例：#海報 #草率季 | Input Placeholder |
| Location Input | `Location (City)` | 所在地點（城市） | Input Placeholder |
| Expiry Date Picker | `Expiry date`  | 貼文截止日期 | Date Picker Placeholder |
| Description Textarea | `description...
If you have multiple items, feel free to list them below.` | 關於資源的更多描述⋯⋯
若有多項物品可於下方詳列。 | Textarea Placeholder |
| Item Name Input | `Item (Optional)` | 子項目名稱（選填） | Input Placeholder |
| Item Quantity Input | `Quantity` | 數量 | Input Placeholder |
| Add Item Row Button | `+` | 新增子項目 | Button |

### Condition 下拉選單選項（物品狀況）

| 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 說明 (Context) |
| --- | --- | --- |
| `Brand New - Unused, sealed in original packaging` | 全新 — 全新未使用，包裝完整 | Level 1 |
| `Like New - Minimal signs of use` | 近全新 — 使用次數極少，幾乎全新 | Level 2 |
| `Good - Normal wear, fully functional` | 良好 — 使用正常，功能外觀完好 | Level 3 |
| `Fair - Noticeable wear, fully functional` | 普通 — 有使用痕跡，但功能正常 | Level 4 |
| `For Parts or Repair - Damaged or not fully functional` | 需要維修 — 有明顯瑕疵或需要修理 | Level 5 |

### 驗證錯誤提示（Validation Messages）

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Alert (empty required fields) | `Required fields cannot be empty.` | 必填欄位不得為空 | Validation Alert |
| Alert (image limit exceeded) | `Limit of 5 images exceeded` | 超過 5 張圖片上限 | Validation Alert |
| Alert (file too large) | `{filename} exceeds 10MB size limit` | {檔名} 超過 10MB 檔案大小限制 | Validation Alert |
| Alert (invalid file type) | `{filename} is not a valid image file` | ~~{檔名} 不是有效的檔案格式~~

僅支援以下檔案類型： png, jpg, wepp, heic, tiff,  | Validation Alert |

---

## 6. 會員個人中心與設定頁面 (`megaweaving.net/user`)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| User Profile Action | `Profile` | 個人檔案 | Navigation / Menu |
| User Profile Action | `Sign Out` | 登出 | Button |
| Avatar Action | `Remove` | 移除照片 | Button |
| Role Badge | `contributor` | 貢獻者 | User Badge / Role |
| Welcome Message | `Welcome, dear contributor!` | 歡迎您，親愛的貢獻者！ | Welcome Banner |
| Section Title | `About Me` | 關於我 | Section Heading |
| Metadata Tag | `Joined in 2025.12` | 加入時間：2025年12月 | Meta Label |
| Section Title | `Contact Setting` | 聯絡資訊設定 | Section Heading |
| Field Label | `Email` | 電子郵件 | Field Label |
| Field Label | `Phone` | 電話號碼 | Field Label |
| Status Indicator | `Private` | 不公開 | Privacy Status |
| Section Title | `Team Member Info.` | 團隊成員資訊 | Section Heading |
| Sub-note | `*megaweaveing Team Only` | *僅限 megaweaving 團隊成員 | Notice Text |
| Field Label | `Title` | 職稱 | Field Label |
| Field Label | `Location` | 所在地區 | Field Label |
| Field Label | `Website` | 個人網站 / 連結 | Field Label |

### 6-a. 訂單狀態卡片 (Order Status Card)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Status / Action Tag | `Weaving` | 交織中 | Transaction Status |
| Status / Action Tag | `Weaved` | 交織成功 | Transaction Status |
| Role Tag | `Giver` | **分享者** | Interaction Role |
| Role Tag | `Receiver` | 接收者 | Interaction Role |
| Transaction Action | `Received the item? Click the checkmark to confirm.` | 是否已收到資源？請點擊勾選框進行確認。 | Instruction / Alert |
| Status Tag | `✓ Completed` | ✓ 已完成 | Status Badge |
| Status Tag | `× Cancelled` / `Canceled` | × 已取消 | Status Badge |

---

## 7. 頁尾導覽 (Footer Section)

| 位置/元素 (Selector / Section) | 英文原文 (Original EN) | 建議中文翻譯 (Traditional Chinese) | 類別 (Category) |
| --- | --- | --- | --- |
| Footer Link | `About Us` | 關於我們 | Footer Link |
| Footer Link | `megaweaving Team` | 團隊介紹 | Footer Link |
| Social Link | `Facebook` | Facebook | Social Link |
| Social Link | `Instagram` | Instagram | Social Link |
| Legal Link | `Privacy Policy` | 隱私權政策 | Legal Link |
| Legal Link | `Terms of Service` | 服務條款 | Legal Link |