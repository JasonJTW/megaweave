-- E2E 環境標記：與 benchmark 相同的隔離標記，E2E reset 只會清空含有此標記的資料庫。
-- 僅由 docker-compose.e2e.yml 在建立全新資料庫時執行；絕對不要在 production 執行。
CREATE TABLE `benchmark_environment` (
  `marker` varchar(64) NOT NULL,
  PRIMARY KEY (`marker`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `benchmark_environment` (`marker`) VALUES ('megaweave-isolated');
