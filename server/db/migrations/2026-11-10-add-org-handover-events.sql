-- Unit Contact handover log (#142, PRD 0001 §5.1 E8-1, ADR 0003, ADR 0004).
--
-- An org item belongs to its unit (posts.org_unit_id); posts.user_id is only its current
-- handler. When a Unit Contact leaves or moves unit, an Org Admin hands their items and open
-- Weaves to another contact of the same unit: posts.user_id and weaves.giver_id change to the
-- new contact. Finished Weaves, messages and receiver_org_unit_id are never rewritten.
--
-- Each moved item gets one row (weave_id NULL), and each moved requested/approved Weave gets one
-- row, so the item timeline (#141, PRD E9-1) can show the original lister (the earliest row's
-- from_user_id, or posts.user_id when there is none) and who handed what to whom, and when.
-- Rows are only inserted, never updated or deleted by the app.

CREATE TABLE `org_handover_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `org_id` bigint unsigned NOT NULL,
  `org_unit_id` bigint unsigned NOT NULL,
  `post_id` bigint unsigned NOT NULL,
  `weave_id` bigint unsigned DEFAULT NULL COMMENT 'NULL = 物品的經手人移轉；有值 = 這筆進行中 Weave 的 Giver 移轉',
  `from_user_id` bigint unsigned NOT NULL COMMENT '原經手人',
  `to_user_id` bigint unsigned NOT NULL COMMENT '新經手人（同單位窗口）',
  `operator_user_id` bigint unsigned NOT NULL COMMENT '執行交接的 Org Admin（或 Platform Admin）',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_org_handover_events_post` (`post_id`,`created_at`),
  KEY `idx_org_handover_events_weave` (`weave_id`),
  KEY `fk_org_handover_events_unit` (`org_id`,`org_unit_id`),
  KEY `fk_org_handover_events_from` (`from_user_id`),
  KEY `fk_org_handover_events_to` (`to_user_id`),
  KEY `fk_org_handover_events_operator` (`operator_user_id`),
  CONSTRAINT `fk_org_handover_events_unit` FOREIGN KEY (`org_id`, `org_unit_id`) REFERENCES `org_units` (`org_id`, `id`),
  CONSTRAINT `fk_org_handover_events_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_handover_events_weave` FOREIGN KEY (`weave_id`) REFERENCES `weaves` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_handover_events_from` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_handover_events_to` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_handover_events_operator` FOREIGN KEY (`operator_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
