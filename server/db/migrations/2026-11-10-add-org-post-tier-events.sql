-- Tier change log for org posts (#138, PRD 0001 §5.1 E2-2/E2-6/E9-1, ADR 0003).
--
-- One row per change of posts.audience_tier: who (a user, or the system for Auto Release #139),
-- when, and from which tier to which. Listing an item is not an event: an item starts in
-- Internal at posts.created_at, so "entered the current tier" = the latest event's created_at,
-- or posts.created_at when there is none.
-- Written in the same transaction as the tier change (server/src/services/orgTierService.ts).
-- Rows are append-only; the app never updates or deletes them.
-- actor_user_id has no ON DELETE: users are not hard-deleted, and history keeps the person.

CREATE TABLE `org_post_tier_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL,
  `org_id` bigint unsigned NOT NULL,
  `from_tier` enum('internal','members','public') COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_tier` enum('internal','members','public') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_type` enum('user','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_user_id` bigint unsigned DEFAULT NULL COMMENT '操作者；系統操作（自動升級）為 NULL',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_org_post_tier_events_post` (`post_id`,`created_at`),
  KEY `idx_org_post_tier_events_org` (`org_id`,`created_at`),
  KEY `idx_org_post_tier_events_actor` (`actor_user_id`),
  CONSTRAINT `fk_org_post_tier_events_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_post_tier_events_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_org_post_tier_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `org_post_tier_events_chk_actor` CHECK (((`actor_type` = 'system') = (`actor_user_id` is null))),
  CONSTRAINT `org_post_tier_events_chk_change` CHECK ((`from_tier` <> `to_tier`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
