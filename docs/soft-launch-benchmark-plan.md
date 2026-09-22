# MegaWeaving Soft-Launch 量測計畫

## 目的與原則

MegaWeaving 尚在 soft launch，這份計畫的目的不是宣稱已承受大量真實使用者，而是建立一套可重跑、可比較、明確記錄成本與部署條件的工程 benchmark。

量測結果必須回答：

1. 在指定資料量、流量與硬體條件下，feed、搜尋與背景任務有多快、多穩定？
2. 現行架構相對於等價的對照組，實際改善了什麼？
3. 瓶頸首先出現在 API、worker、MySQL、Redis 還是外部 API？
4. 增加 replica 是否值得其成本？

所有數據都應標示為 benchmark 或 synthetic workload；在沒有足夠真實使用者樣本前，不以此宣稱真實產品成長、留存或轉換提升。

## 名詞

- **p50 latency**：50% 請求在此時間內完成，也就是中位數
- **p95 latency**：95% 請求在此時間內完成；最慢 5% 的請求更慢
- **p99 latency**：99% 請求在此時間內完成；用來觀察尾端慢請求
- **RPS**：requests per second，每秒成功或總請求數
- **Replica**：同一服務同時運行的實例數，例如 2 個 API containers
- **Baseline**：和現行實作比較的等價對照組；不必是產品歷史版本

## 量測順序

| 順序 | 量測事項 | 問題 | 工具 | 主要產出 |
| --- | --- | --- | --- | --- |
| 0 | 固定測試條件 | 結果是否可重跑與比較？ | Docker Compose、版本控制 | benchmark environment spec |
| 1 | 建立 fixture | 資料量與資料形狀是否代表未來使用情況？ | TypeScript seed script、MySQL、Redis Stack | 1k、10k、50k 資料集 |
| 2 | 基本正確性 | 核心流程與失敗處理是否正確？ | Jest、Supertest、mocks | critical-path test report |
| 3 | Feed 效能 | late materialization、cache、rerank 是否改善效能？ | k6 或 Artillery、MySQL logs、Redis metrics | latency/RPS/error benchmark |
| 4 | HNSW/semantic search | 向量索引在資料量成長後是否仍可用？ | k6、Redis Stack `FT.INFO` | index 規模 vs latency 曲線 |
| 5 | Queue burst | API/worker 分離是否能承受短時間任務高峰？ | BullMQ metrics、k6、Docker stats | queue wait、throughput、recovery |
| 6 | 故障注入 | 外部服務或 worker 失敗時是否可恢復？ | mocks、Docker restart、BullMQ logs | retry/fallback/recovery report |
| 7 | 水平擴展 | 增加 API 或 worker 是否帶來合理效益？ | Docker Compose scale、k6 | capacity/cost curve |
| 8 | 圖片與前端 | 圖片 pipeline 與載入體驗是否達標？ | CloudWatch/Lambda logs、Lighthouse | image/web-vitals report |
| 9 | 真實產品成效 | 推薦是否帶動實際互動與交換？ | event tracking、feature flag、dashboard | A/B test report |

前兩輪只需做 0–6；第 7 步在找到單機瓶頸後再做；第 9 步等待真實使用者樣本。

## 固定測試條件

每次 benchmark 都必須記錄下列資訊；脫離這些條件的 latency、throughput 或 queue 數據沒有可比較性。

| 類別 | 必須記錄 |
| --- | --- |
| Code | git commit SHA、Node.js 版本、依賴版本 |
| API | replica 數、CPU/RAM limits、connection pool limit |
| Worker | replica 數、各 BullMQ queue concurrency |
| Database | MySQL 版本、CPU/RAM、storage type、最大連線數 |
| Cache/vector | Redis Stack 版本、CPU/RAM、HNSW index 設定 |
| External APIs | 真實服務或 mock、mock 延遲／錯誤率、rate limit |
| Dataset | 貼文、使用者、圖片、地點、互動、embedding 數量與平均內容長度 |
| Workload | 虛擬使用者數、duration、think time、endpoint mix |
| Cost | instance/container 規格與每小時成本，或可推得成本的部署資訊 |

### 第一輪建議環境

先使用低成本、變因最少的 single-replica benchmark：

```text
API:       1 replica
Worker:    1 replica
MySQL:     1 instance
Redis:     1 instance per configured role
Resources: 明確設定每個 container 的 CPU/RAM limits，例如 1 vCPU / 2 GB RAM
Data:      1k 與 10k posts
Load:      5、10、20 concurrent virtual users
```

這是 benchmark baseline，不是高可用 production 宣稱。後續只有在要驗證獨立擴展能力時，才分別測 API 1→2、worker 1→2→4 replicas。

## 資料集與 fixture

### 規模

建立可用固定 seed 重現的資料集：

| Dataset | 用途 |
| --- | --- |
| 1k posts | 本機開發、功能與初步 smoke benchmark |
| 10k posts | 第一輪主要效能 benchmark |
| 50k posts | 資料成長、HNSW 與 Redis memory benchmark |

資料要模擬代表性形狀，而不是只有空白或完全相同內容：

- 貼文類型、分類、條件、地點、created_at 與有效期限
- 每篇不同數量的 items/images
- 真實比例的 active、closed、expired posts
- views、likes、comments、weaves 等不同互動密度
- 長短不一的中文貼文內容與搜尋關鍵字

### Embedding

目前使用 `text-embedding-3-small`。成本計算式：

```text
成本 = 貼文數 × 每篇 token 數 ÷ 1,000,000 × 每百萬 tokens 單價
```

以 50k 筆貼文估算：

| 每篇 embedding 文字長度 | 總 input tokens | 預估 API 成本 |
| ---: | ---: | ---: |
| 100 tokens | 5M | US$0.10 |
| 300 tokens | 15M | US$0.30 |
| 500 tokens | 25M | US$0.50 |
| 1,000 tokens | 50M | US$1.00 |

實際單價以 [OpenAI text-embedding-3-small 官方定價](https://developers.openai.com/api/docs/models/text-embedding-3-small) 為準。

真實 embedding 應產生一次後保存為 fixture。Feed、Redis、HNSW 與 queue 壓測重用 fixture；只有驗證 OpenAI rate limit、retry 與成本時，才對少量樣本呼叫真實 API。

## 測試一：Feed 效能

### 目的

驗證 late materialization、in-memory vector cache 與 hybrid re-ranking 是否比等價完整 hydration 更有效率。

### 對照組

| 組別 | 行為 |
| --- | --- |
| Baseline | 取得候選貼文時，直接做完整 6-table join 與完整資料 hydration |
| Current | 先取得輕量候選資料，in-memory rerank，只 hydration 當頁貼文 |

Baseline 只可供 benchmark 使用，不能在正式環境取代目前實作。兩組必須使用相同資料、硬體、workload 與測試時長。

### Workload

- Endpoint：一般首頁 feed、Tinder/filter feed、semantic search、cold-start fallback
- Concurrency：5、10、20 virtual users 起步
- Duration：每個 scenario 至少 5 分鐘，包含 warm-up
- Think time：模擬人類閱讀間隔，例如 3–8 秒
- 每一組至少執行 3 次，取中位數；cold cache 與 warm cache 分開報告

### 量測

- API p50/p95/p99 latency
- RPS 與 error rate
- MySQL query count、query duration、rows examined/returned
- Redis calls、cache hit rate、memory usage
- API CPU、heap memory
- response payload bytes

### 工具

- **k6**：以 JavaScript 定義虛擬使用者與 HTTP workload，推薦作為主要工具
- **Artillery**：可作為 Node.js/Socket.IO 情境的替代工具
- MySQL slow query log 或 performance schema
- Redis `INFO memory`、`FT.INFO`
- Docker stats 或部署平台 metrics

### 可用履歷數據

只有完成等價對照後，才可寫：

> Reduced p95 feed latency by X% versus an equivalent full-hydration baseline on a 10k-post benchmark

若無對照組，改寫絕對值：

> Maintained p95 feed latency below X ms on a 10k-post benchmark at Y concurrent virtual users

## 測試二：HNSW 與 Semantic Search

### 目的

驗證 Redis Stack HNSW vector index 在資料量增加時的查詢延遲、記憶體使用量與 fallback 行為。

### 量測

- 1k、10k、50k vectors 的 index build time
- top-k search p50/p95 latency
- HNSW index 與 Redis total memory
- no-result rate
- vector service unavailable 時的 keyword/trending fallback success rate
- 可選：30 個人工標註 query 的 Recall@12、NDCG@12

### 工具

- k6/Artillery 呼叫搜尋 endpoint
- Redis Stack `FT.INFO` 與 `INFO memory`
- 代表性 query set；品質測試另建立人工標註答案表

## 測試三：BullMQ Queue Burst

### 目的

驗證 API 與背景 worker 分離後，重任務尖峰不會拖慢 user-facing API。

### Workload

依序送入 100、500、1,000 個模擬貼文/互動，產生：

- post image jobs
- post embedding jobs
- user-vector update jobs

同時持續呼叫 feed 與 post creation endpoint。

### 量測

- 每個 queue completed jobs/hour
- queue wait p50/p95
- processing time p50/p95
- retry rate、terminal failure rate
- peak queue depth
- 停止送入工作後，回到 zero backlog 的時間
- worker 壓力期間，feed 與 post creation 的 p95 latency
- API/worker CPU、memory、MySQL connections、Redis memory

### 工具

- BullMQ queue/job APIs，或 Bull Board
- k6/Artillery 產生貼文與互動 workload
- Docker stats、MySQL、Redis metrics
- 結構化 logs，並將每次結果寫入 JSON/CSV

### 報告格式

數字必須包含條件，例如：

> With 1 API and 1 worker replica, each limited to 1 vCPU/2 GB RAM, processed X embedding jobs/hour while maintaining post-creation p95 below Y ms

不可只報告「每小時處理 X jobs」。

## 測試四：故障注入與恢復

### 情境

- OpenAI embedding API 回傳 429、500 或 timeout
- S3 或 image Lambda 暫時失敗
- Redis vector service 暫時不可用
- worker 在處理任務途中 restart
- MySQL 短暫斷線

### 量測

- API request success rate
- retry 後 final success rate
- fallback success rate
- retry attempts
- 重複寫入數
- 遺失 embedding/image/job 數，目標為 0
- 恢復後清空 backlog 的時間

### 工具

- OpenAI/S3/Lalamove mock server，控制成功、429、500、timeout
- Docker Compose restart/stop
- BullMQ job history
- MySQL consistency queries

## 測試五：水平擴展與成本

僅在單 replica benchmark 已找出瓶頸後進行。

### 方法

固定資料集與 workload，每次只改一個維度：

```text
Worker scaling: API 固定 1；worker 1 → 2 → 4
API scaling:    worker 固定 1；API 1 → 2
```

### 量測

- throughput 變化
- feed latency 或 queue wait p95 變化
- CPU/memory、MySQL connections、Redis memory
- first bottleneck：OpenAI、MySQL、Redis、CPU 或 network
- 每個 configuration 的每小時成本
- 每新增 US$1/hour 帶來的額外 throughput

若 worker 1→2 改善大、2→4 幾乎無改善，代表瓶頸已移往資料庫、Redis 或外部 API；這是有效結論。

## 測試六：圖片與前端體驗

### 圖片 pipeline

使用不同尺寸與格式的代表性手機照片，量測：

- image resize p50/p95
- 成功率與重試率
- 原圖、medium、thumbnail 的 median bytes
- delivered image payload reduction

工具：AWS CloudWatch/Lambda logs 或等價應用程式 logs。

### Frontend

在代表性首頁、貼文詳情、建立貼文頁面量測：

- Lighthouse Performance score
- LCP、INP、CLS
- accessibility score

工具：Lighthouse CI 或 Chrome DevTools。

## 真實使用者開始累積後

工程 benchmark 不能代替產品成效。推薦效果需等有足夠樣本後，以固定分流的 A/B test 驗證。

### 需補的事件

- `feed_impression`：session/user、post、rank、feed variant、fallback mode、timestamp
- `post_open`
- `like`、`comment`
- `weave_requested`、`weave_accepted`、`weave_completed`
- `search_submitted`：query、result count、search mode、latency

事件要有 deduplication ID 與 session/anonymous identifier。現有 `post_views` 可作粗略觀看資料，但不足以得知曝光排名、演算法版本或真實 CTR。

### 實驗

| Group | 排序 |
| --- | --- |
| Control | 熱門 + 地理排序 |
| Treatment | semantic + popularity + geography hybrid ranking |

主要指標：`weave_requested / unique feed viewer`。

次要指標：post-open rate、like rate、7-day weave completion、retention。

護欄指標：zero-result rate、p95 feed latency、error rate、early-exit rate。

## 必備準備清單

- [ ] 隔離的 staging/benchmark environment，絕不對 production MySQL、Redis 或真實使用者壓測
- [ ] 明確的 container CPU/RAM limits 與 deployment topology
- [ ] 可用固定 seed 重現的 fixture generator
- [ ] 已保存的 embedding fixture，避免每次 benchmark 呼叫 OpenAI
- [ ] k6 scripts：feed、search、post creation、interaction scenarios
- [ ] benchmark-only baseline switch：可關閉 cache 或採 full hydration 對照組
- [ ] OpenAI、S3、Lambda、Lalamove mocks
- [ ] 每次 benchmark 的 JSON/CSV output
- [ ] Results template：目的、commit SHA、環境、dataset、workload、結果、瓶頸、下一步
- [ ] 每個 deployment configuration 的成本表

## 目前 blockers

1. **沒有隔離 benchmark/staging 環境**：不可安全做壓測、故障注入或資料大量寫入
2. **沒有代表性 fixture**：空白、重複或過小資料無法反映 MySQL join、Redis index、payload 與 cache 行為
3. **缺少 application-level instrumentation**：k6 可觀察外部 latency；若要定位慢在 MySQL、Redis、rerank 或 cache，需增加最小化 metrics/logging
4. **沒有 feed impression/rank/variant tracking**：不影響工程 benchmark，但阻礙未來推薦 A/B test
5. **外部 API 不宜作壓測依賴**：吞吐測試應以 mocks 為主；真實 API 僅小樣本驗證 rate limit、成本與 retry
6. **尚未定義 capacity target**：第一輪以 5/10/20 virtual users 為起點，依結果與 soft-launch 預期調整，不追求任意高併發

## 第一階段最小交付物

第一階段只完成下列項目：

1. 10k-post fixture 與固定 single-replica benchmark environment
2. Feed baseline vs current benchmark
3. 500-job embedding/image burst benchmark
4. OpenAI 429 與 worker restart 故障測試
5. 每次 run 輸出 JSON/CSV，以及一頁 benchmark report

第一階段完成後，應能得到：可驗證的履歷工程數據、下一個擴展瓶頸，以及供真實產品實驗延續的量測基礎。
