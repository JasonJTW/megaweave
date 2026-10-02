-- feed benchmark 讀取 statement 總量（次數、耗時、examined/sent rows）；唯讀
-- 僅由 docker-compose.benchmark.yml 在建立全新資料庫時執行。
GRANT SELECT ON `performance_schema`.* TO 'benchmark'@'%';
