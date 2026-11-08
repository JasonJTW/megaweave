-- Weave review / hand-over log for org items (#141, PRD 0001 §5.1 E9-1, ADR 0003, ADR 0004).
--
-- weaves only keeps the current status, so nothing said who approved, declined or confirmed a
-- Weave on an org item, or when. The item timeline needs "核可：誰、何時" and "交接完成" with the
-- actor, so every status change of a Weave on an org post writes one row here, in the same
-- transaction as the change (server/src/services/orgWeaveEvents.ts):
--   approved / declined / withdrawn / cancelled  — the reviewer or party who did it
--   confirmed  — one side confirmed the hand-over (the other hasn't yet)
--   completed  — the second confirmation, which completes the Weave
-- actor_user_id NULL means the system did it: auto-declines on a tier demotion (#138) or on
-- member removal (#142). The request itself is not a row: it is weaves.created_at + receiver_id.
-- Rows are append-only; the app never updates or deletes them. actor_user_id has no ON DELETE:
-- users are not hard-deleted, and history keeps the person.

CREATE TABLE `org_weave_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `weave_id` bigint unsigned NOT NULL,
  `post_id` bigint unsigned NOT NULL,
  `org_id` bigint unsigned NOT NULL,
  `action` enum('approved','declined','withdrawn','cancelled','confirmed','completed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_user_id` bigint unsigned DEFAULT NULL COMMENT '操作者；系統自動婉拒為 NULL',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_org_weave_events_post` (`post_id`,`created_at`),
  KEY `idx_org_weave_events_org` (`org_id`,`created_at`),
  KEY `idx_org_weave_events_weave` (`weave_id`),
  KEY `idx_org_weave_events_actor` (`actor_user_id`),
  CONSTRAINT `fk_org_weave_events_weave` FOREIGN KEY (`weave_id`) REFERENCES `weaves` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_weave_events_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_weave_events_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_org_weave_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
