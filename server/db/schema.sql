
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  KEY `idx_status` (`status`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comment_edit_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comment_id` bigint unsigned NOT NULL,
  `old_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `new_content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `edited_by` bigint unsigned NOT NULL,
  `edited_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_comment_id` (`comment_id`),
  KEY `idx_edited_at` (`edited_at`),
  KEY `comment_edit_history_ibfk_2` (`edited_by`),
  CONSTRAINT `comment_edit_history_ibfk_1` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_edit_history_ibfk_2` FOREIGN KEY (`edited_by`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comment_likes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comment_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_comment_like` (`comment_id`,`user_id`),
  KEY `idx_comment_id` (`comment_id`),
  KEY `idx_user_id` (`user_id`),
  CONSTRAINT `comment_likes_ibfk_1` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_likes_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_comment_like_insert_stats` AFTER INSERT ON `comment_likes` FOR EACH ROW BEGIN
    UPDATE comments SET like_count = like_count + 1 
    WHERE id = NEW.comment_id;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_comment_like_delete_stats` AFTER DELETE ON `comment_likes` FOR EACH ROW BEGIN
    UPDATE comments SET like_count = like_count - 1 
    WHERE id = OLD.comment_id;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comment_mentions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comment_id` bigint unsigned NOT NULL,
  `mentioned_user_id` bigint unsigned NOT NULL,
  `mentioning_user_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_mention` (`comment_id`,`mentioned_user_id`),
  KEY `idx_mentioned_user` (`mentioned_user_id`),
  KEY `idx_comment_id` (`comment_id`),
  KEY `comment_mentions_ibfk_3` (`mentioning_user_id`),
  CONSTRAINT `comment_mentions_ibfk_1` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_mentions_ibfk_2` FOREIGN KEY (`mentioned_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_mentions_ibfk_3` FOREIGN KEY (`mentioning_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comment_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `comment_id` bigint unsigned NOT NULL,
  `trigger_user_id` bigint unsigned NOT NULL,
  `type` enum('reply','mention','like') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_id_read` (`user_id`,`is_read`),
  KEY `idx_created_at` (`created_at`),
  KEY `comment_notifications_ibfk_3` (`trigger_user_id`),
  KEY `comment_notifications_ibfk_2` (`comment_id`),
  CONSTRAINT `comment_notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_notifications_ibfk_2` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_notifications_ibfk_3` FOREIGN KEY (`trigger_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL,
  `item_id` bigint unsigned DEFAULT NULL,
  `parent_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  `like_count` int DEFAULT '0',
  `reply_count` int DEFAULT '0',
  `depth` int DEFAULT '0',
  `path` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '',
  `root_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_post_id` (`post_id`),
  KEY `idx_parent_id` (`parent_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_root_id` (`root_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_path` (`path`),
  KEY `idx_post_parent_created` (`post_id`,`parent_id`,`created_at`),
  KEY `idx_item_id` (`item_id`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comments_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comments_ibfk_4` FOREIGN KEY (`root_id`) REFERENCES `comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comments_ibfk_5` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_comment_insert_stats` AFTER INSERT ON `comments` FOR EACH ROW BEGIN
    UPDATE posts SET comment_count = comment_count + 1 
    WHERE id = NEW.post_id;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 */ /*!50003 TRIGGER `after_comment_delete_stats` AFTER UPDATE ON `comments` FOR EACH ROW BEGIN
    IF NEW.is_deleted = 1 AND OLD.is_deleted = 0 THEN
        UPDATE posts SET comment_count = comment_count - 1 
        WHERE id = NEW.post_id;
    END IF;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conditions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `level` tinyint NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `level` (`level`),
  KEY `idx_conditions_level` (`level`),
  KEY `idx_conditions_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation_users` (
  `conversation_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `last_read_message_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `fk_cu_last_message` (`last_read_message_id`),
  KEY `idx_cu_user` (`user_id`),
  CONSTRAINT `fk_cu_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cu_last_message` FOREIGN KEY (`last_read_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cu_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user1_id` bigint unsigned NOT NULL,
  `user2_id` bigint unsigned NOT NULL,
  `last_message_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_message_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_conversation_users` (`user1_id`,`user2_id`),
  KEY `idx_last_message_at` (`last_message_at`),
  KEY `fk_conv_user2` (`user2_id`),
  KEY `last_message_id` (`last_message_id`),
  CONSTRAINT `fk_conv_last_message` FOREIGN KEY (`last_message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conv_user1` FOREIGN KEY (`user1_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_user2` FOREIGN KEY (`user2_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `check_user_order` CHECK ((`user1_id` < `user2_id`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_order_events` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '事件記錄主鍵 ID',
  `delivery_order_id` int NOT NULL COMMENT '關聯之外送訂單 ID (delivery_orders.id)',
  `event_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Lalamove 事件唯一識別碼',
  `event_status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '事件狀態 (如 ORDER_PLACED, DRIVER_ASSIGNED, ORDER_PICKED_UP 等)',
  `raw_payload` json NOT NULL COMMENT '收到之完整事件 JSON 內容',
  `received_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '事件接收時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_id` (`event_id`),
  KEY `idx_delivery_order_id` (`delivery_order_id`),
  CONSTRAINT `delivery_order_events_ibfk_1` FOREIGN KEY (`delivery_order_id`) REFERENCES `delivery_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='外送訂單事件歷史紀錄表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `delivery_orders` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '外送訂單主鍵 ID',
  `user_id` int NOT NULL COMMENT '建立訂單的使用者 ID',
  `payment_id` int DEFAULT NULL COMMENT '關聯的金流交易 ID (payments.id)',
  `post_id` int DEFAULT NULL COMMENT '關聯的刊登貼文/商品 ID',
  `pickup_location_id` bigint unsigned NOT NULL COMMENT '取件地點 ID (locations.id)',
  `pickup_address_snapshot` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '取件地址快照文字',
  `pickup_remarks` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '取件備註 (如樓層、門禁)',
  `dropoff_location_id` bigint unsigned NOT NULL COMMENT '送件地點 ID (locations.id)',
  `dropoff_address_snapshot` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '送件地址快照文字',
  `dropoff_remarks` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '送件備註 (如收件注意事項)',
  `sender_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '寄件人姓名',
  `sender_phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '寄件人電話',
  `recipient_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '收件人姓名',
  `recipient_phone` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '收件人電話',
  `service_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Lalamove 服務車型 (如 MOTORCYCLE, SEDAN, SUV, 1.75T_VAN 等)',
  `quotation_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Lalamove 報價單 ID',
  `lalamove_order_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Lalamove 正式下單之訂單編號',
  `share_link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Lalamove 訂單即時追蹤連結',
  `status` enum('QUOTED','PAYMENT_PENDING','ORDER_PLACING','ASSIGNING_DRIVER','ON_GOING','PICKED_UP','COMPLETED','FAILED','CANCELLED','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PAYMENT_PENDING' COMMENT '外送訂單狀態 (QUOTED 已報價, PAYMENT_PENDING 待付款, ORDER_PLACING 下單中, ASSIGNING_DRIVER 配對司機中, ON_GOING 外送中, PICKED_UP 已取件, COMPLETED 已完成, FAILED 失敗, CANCELLED 已取消, EXPIRED 已過期)',
  `fee_total` int NOT NULL COMMENT '運費總額 (新台幣整數)',
  `expires_at` datetime NOT NULL COMMENT '報價有效截止時間',
  `driver_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '接單司機姓名',
  `driver_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '接單司機電話',
  `driver_plate_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '司機車牌號碼',
  `failure_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '訂單失敗或取消原因說明',
  `raw_webhook_payload` json DEFAULT NULL COMMENT 'Lalamove Webhook 最新推送之原始 Payload (JSON)',
  `version` int NOT NULL DEFAULT '0' COMMENT '樂觀鎖版本號 (防止併發更新衝突)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `quotation_id` (`quotation_id`),
  UNIQUE KEY `payment_id` (`payment_id`),
  UNIQUE KEY `lalamove_order_id` (`lalamove_order_id`),
  KEY `pickup_location_id` (`pickup_location_id`),
  KEY `dropoff_location_id` (`dropoff_location_id`),
  KEY `idx_user_status` (`user_id`,`status`),
  KEY `idx_expires_at` (`expires_at`),
  CONSTRAINT `delivery_orders_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `delivery_orders_ibfk_2` FOREIGN KEY (`pickup_location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `delivery_orders_ibfk_3` FOREIGN KEY (`dropoff_location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='外送訂單表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL,
  `s3_key` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alt_text` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_post_id` (`post_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `images_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `post_id` (`post_id`),
  CONSTRAINT `items_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `place_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Google 提供的唯一識別碼',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地點/地標名稱 (name)',
  `full_address` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '完整地址字串 (formatted_address)',
  `province` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '縣市 (administrative_area_level_1)',
  `city` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '鄉鎮市區 (sublocality_level_1 或 level_2)',
  `route` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '街道名稱 (route)',
  `zip_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '郵遞區號 (postal_code)',
  `lat` decimal(10,8) NOT NULL COMMENT '緯度',
  `lng` decimal(11,8) NOT NULL COMMENT '經度',
  `url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'Google Maps 連結 (url)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `place_id` (`place_id`),
  KEY `idx_province_city` (`province`,`city`),
  KEY `idx_coordinates` (`lat`,`lng`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `members` (
  `user_id` int NOT NULL,
  `member_bio` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `member_bio_updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_role` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `member_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `websites` json DEFAULT NULL,
  `avatar_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_key` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `message_attachments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `message_id` bigint unsigned NOT NULL,
  `file_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` enum('image','video','file') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `message_id` (`message_id`),
  CONSTRAINT `message_attachments_ibfk_1` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint unsigned NOT NULL,
  `sender_id` bigint unsigned NOT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `message_type` varchar(50) NOT NULL DEFAULT 'text',
  `metadata` json DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversation_created` (`conversation_id`,`created_at`),
  KEY `fk_msg_sender` (`sender_id`),
  KEY `idx_conversation_id_id` (`conversation_id`,`id` DESC),
  CONSTRAINT `fk_msg_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `recipient_id` int NOT NULL,
  `sender_id` int DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `link` varchar(255) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `recipient_id` (`recipient_id`),
  KEY `is_read` (`is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payment_refunds` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '退款記錄主鍵 ID',
  `payment_id` int NOT NULL COMMENT '關聯之原付款紀錄 ID (payments.id)',
  `merchant_refund_no` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商店自訂退款單號',
  `refund_amount` int NOT NULL COMMENT '退款金額 (新台幣整數)',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '退款原因說明',
  `status` enum('PENDING','SUCCESS','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT '退款狀態 (PENDING 處理中, SUCCESS 成功, FAILED 失敗)',
  `provider_refund_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '金流商退款流水號/交易代碼',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `merchant_refund_no` (`merchant_refund_no`),
  KEY `idx_payment_id` (`payment_id`),
  CONSTRAINT `payment_refunds_ibfk_1` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='退款紀錄表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主鍵 ID',
  `user_id` int NOT NULL COMMENT '建立付款的使用者 ID',
  `merchant_trade_no` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '商店自訂訂單編號 (綠界 MerchantTradeNo)',
  `provider` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ECPAY' COMMENT '金流服務商 (如 ECPAY)',
  `payment_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'Credit' COMMENT '付款方式 (如 Credit, ATM, CVS)',
  `amount` int NOT NULL COMMENT '交易金額 (新台幣整數)',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TWD' COMMENT '幣別 (預設 TWD)',
  `status` enum('PENDING','PAID','FAILED','CANCELLED','PARTIAL_REFUNDED','REFUNDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING' COMMENT '付款狀態 (PENDING 待付款, PAID 已付款, FAILED 失敗, CANCELLED 已取消, PARTIAL_REFUNDED 部分退款, REFUNDED 已全額退款)',
  `trade_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '金流商交易編號 (綠界 TradeNo)',
  `rtn_code` int DEFAULT NULL COMMENT '金流商回傳代碼 (綠界 RtnCode，1 代表成功)',
  `rtn_msg` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '金流商回傳訊息 (綠界 RtnMsg)',
  `payment_date` datetime DEFAULT NULL COMMENT '付款完成時間 (綠界 PaymentDate)',
  `simulated_paid` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否為模擬付款 (0: 否, 1: 是)',
  `processed_at` datetime DEFAULT NULL COMMENT '系統處理 Webhook 回呼完成時間',
  `raw_callback_payload` json DEFAULT NULL COMMENT '金流商回傳之原始 Webhook Payload (JSON)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '建立時間',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新時間',
  PRIMARY KEY (`id`),
  UNIQUE KEY `merchant_trade_no` (`merchant_trade_no`),
  UNIQUE KEY `trade_no` (`trade_no`),
  KEY `idx_user_status` (`user_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='金流交易表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_likes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `post_id` bigint unsigned NOT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_post` (`user_id`,`post_id`),
  KEY `idx_post` (`post_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `post_likes_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `post_likes_ibfk_2` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_views` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `post_id` bigint unsigned NOT NULL,
  `viewed_at` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_user_post` (`user_id`,`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `posts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` bigint unsigned DEFAULT NULL,
  `type` enum('wish','share','commons') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `tags` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category_id` int NOT NULL,
  `condition_level` tinyint NOT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `view_count` int DEFAULT '0',
  `likes_count` int DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `comment_count` bigint NOT NULL DEFAULT '0',
  `hot_score` double NOT NULL DEFAULT '0',
  `embedding` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_posts_public_id` (`public_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_type` (`type`),
  KEY `idx_status` (`status`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_expires_at` (`expires_at`),
  KEY `idx_condition_level` (`condition_level`),
  KEY `idx_type_status` (`type`,`status`),
  KEY `idx_type_category` (`type`,`category_id`),
  KEY `fk_post_location` (`location_id`),
  KEY `idx_deleted_at` (`deleted_at`),
  KEY `idx_hot_score` (`hot_score` DESC),
  FULLTEXT KEY `idx_search` (`title`,`content`,`tags`),
  CONSTRAINT `fk_post_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_posts_condition_level` FOREIGN KEY (`condition_level`) REFERENCES `conditions` (`level`),
  CONSTRAINT `fk_posts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `posts_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `posts_chk_1` CHECK (((`condition_level` >= 1) and (`condition_level` <= 5)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `user_id` int NOT NULL,
  `bio` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `bio_updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `custom_name` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interest_vector` json DEFAULT NULL,
  `vector_updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_stats` (
  `user_id` bigint unsigned NOT NULL,
  `post_count` int DEFAULT '0' COMMENT 'Number of posts published',
  `item_count` int DEFAULT '0' COMMENT 'Number of distinct items published',
  `total_item_quantity` int DEFAULT '0' COMMENT 'Total quantity of all items',
  `posts_with_items` int DEFAULT '0' COMMENT 'Number of posts that have items',
  `weave_count` int DEFAULT '0' COMMENT 'Total number of completed transactions',
  `weave_as_giver` int DEFAULT '0' COMMENT 'Number of times as giver',
  `weave_as_receiver` int DEFAULT '0' COMMENT 'Number of times as receiver',
  `total_quantity_given` int DEFAULT '0' COMMENT 'Total quantity of items given away',
  `total_quantity_received` int DEFAULT '0' COMMENT 'Total quantity of items received',
  `total_likes` int DEFAULT '0' COMMENT 'Total likes received',
  `total_comments` int DEFAULT '0' COMMENT 'Total comments received',
  `total_views` int DEFAULT '0' COMMENT 'Total views received',
  `points` decimal(10,2) DEFAULT '0.00' COMMENT 'User points',
  `give_success_rate` decimal(5,2) DEFAULT '0.00' COMMENT 'Give success rate (%)',
  `last_calculated_at` timestamp NULL DEFAULT NULL COMMENT 'Last calculation time',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  KEY `idx_points` (`points` DESC),
  KEY `idx_weave_count` (`weave_count` DESC),
  KEY `idx_total_quantity_given` (`total_quantity_given` DESC),
  KEY `idx_total_quantity_received` (`total_quantity_received` DESC),
  KEY `idx_give_success_rate` (`give_success_rate` DESC),
  CONSTRAINT `fk_user_stats_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User statistics cache table';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `role` varchar(255) NOT NULL DEFAULT 'user',
  `salt` char(32) DEFAULT NULL,
  `google_id` varchar(255) DEFAULT NULL,
  `facebook_id` varchar(255) DEFAULT NULL,
  `providers` json DEFAULT NULL,
  `avatar_url` varchar(500) DEFAULT NULL,
  `avatar_key` varchar(500) DEFAULT NULL,
  `contact_line` varchar(255) DEFAULT NULL,
  `public_id` char(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `idx_public_id` (`public_id`),
  UNIQUE KEY `google_id` (`google_id`),
  UNIQUE KEY `facebook_id` (`facebook_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `weave_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `weave_id` bigint unsigned NOT NULL COMMENT '對應的 weave 紀錄',
  `item_id` bigint unsigned DEFAULT NULL COMMENT '對應的 item，若 item 被刪除可為 NULL',
  `quantity` int NOT NULL DEFAULT '1' COMMENT '該項目的數量',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_weave_id` (`weave_id`),
  KEY `idx_item_id` (`item_id`),
  CONSTRAINT `fk_weave_items_item` FOREIGN KEY (`item_id`) REFERENCES `items` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_weave_items_weave` FOREIGN KEY (`weave_id`) REFERENCES `weaves` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `weaves` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL COMMENT '哪篇貼文',
  `giver_id` bigint unsigned NOT NULL COMMENT '給予者（原 post 作者）',
  `receiver_id` bigint unsigned NOT NULL COMMENT '接收者（索取者）',
  `conversation_id` bigint unsigned DEFAULT NULL,
  `status` enum('pending','completed','cancelled','requested','rejected') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `giver_confirmed` tinyint(1) DEFAULT '0',
  `receiver_confirmed` tinyint(1) DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci COMMENT '備註',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成時間',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_post_id` (`post_id`),
  KEY `idx_giver_id` (`giver_id`),
  KEY `idx_receiver_id` (`receiver_id`),
  KEY `idx_status` (`status`),
  KEY `idx_completed_at` (`completed_at`),
  KEY `idx_conversation_id` (`conversation_id`),
  CONSTRAINT `fk_weaves_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_weaves_giver` FOREIGN KEY (`giver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_weaves_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_weaves_receiver` FOREIGN KEY (`receiver_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

