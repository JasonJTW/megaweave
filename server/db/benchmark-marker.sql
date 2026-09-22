-- Benchmark 環境標記：fixture loader 只會重置並寫入含有此標記的資料庫。
-- 僅由 docker-compose.benchmark.yml 在建立全新資料庫時執行；絕對不要在 production 執行。
CREATE TABLE `benchmark_environment` (
  `marker` varchar(64) NOT NULL,
  PRIMARY KEY (`marker`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `benchmark_environment` (`marker`) VALUES ('megaweave-isolated');

-- feed benchmark 讀取 statement 總量（次數、耗時、examined/sent rows）；唯讀
GRANT SELECT ON `performance_schema`.* TO 'benchmark'@'%';
