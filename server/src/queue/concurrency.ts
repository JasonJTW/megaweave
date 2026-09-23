// server/src/queue/concurrency.ts
// 每個 BullMQ worker 在單一 worker process 中同時處理的 job 數；獨立成模組，讓 benchmark 結果可記錄實際設定而不必載入 worker。

export const WORKER_CONCURRENCY = {
  // 每張圖是 S3 下載 → sharp（libuv 執行緒池，不阻塞 event loop）→ S3 上傳 → 刪除 staging；
  // 2 讓一個 job 等待 S3 時另一個使用 CPU。每個 job 最多同時持有 5 張原圖與解碼緩衝，調高前先確認 worker 記憶體上限
  "post-image": 2,
  email: 1,
  "post-embedding": 2,
  "user-vector": 5,
  "hot-score": 1,
  // 確保同一時間只有一個 flush job 操作 dirty set，避免多個 worker 同時 SPOP 造成資料競態
  "user-vector-flush": 1,
  "delivery-reconcile": 1,
} as const;
