-- 隔離環境標記：benchmark / E2E 的 reset 只會清空含有此標記的資料庫。
-- 僅由 docker-compose.benchmark.yml / docker-compose.e2e.yml 在建立全新資料庫時執行；絕對不要在 production 執行。
CREATE TABLE `isolated_environment` (
  `marker` varchar(64) NOT NULL,
  PRIMARY KEY (`marker`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `isolated_environment` (`marker`) VALUES ('megaweave-isolated');
