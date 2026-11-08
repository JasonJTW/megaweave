-- Pending Public for org items (#140, PRD 0001 §5.1 E2-7, E4-2; ADR 0003).
--
-- Only an Org Admin can move an item to Public, and it waits 10 minutes first ("待公開"):
-- the item keeps its tier (no feed, no ranking, no notification) and can be cancelled in one
-- click. When the time is up the org-pending-public cron promotes it through
-- orgTierService.changePostTier, so the tier change lands in org_post_tier_events as usual.
--
-- org_post_details.pending_public_due_at: set while the item is pending, NULL otherwise.
-- pending_public_by: the admin who started it; the tier event is recorded under their name.
--
-- org_pending_public_events: append-only log of the pending period itself. A cancel is not a
-- tier change, so it can't go to org_post_tier_events; it goes here ("取消後留下紀錄").
--   started   — admin started the period; asset_disposal_confirmed = 1 when the item has an
--               asset number and the admin confirmed "已完成報廢／處分程序" (E4-2)
--   cancelled — admin cancelled it; the item stays in its tier
--   skipped   — a demo org's admin published at once (organizations.is_demo, ADR 0003)

ALTER TABLE `org_post_details`
  ADD COLUMN `pending_public_due_at` datetime(3) DEFAULT NULL AFTER `auto_release_days`,
  ADD COLUMN `pending_public_by` bigint unsigned DEFAULT NULL AFTER `pending_public_due_at`,
  ADD KEY `idx_org_post_details_pending_public` (`pending_public_due_at`),
  ADD CONSTRAINT `fk_org_post_details_pending_public_by` FOREIGN KEY (`pending_public_by`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `org_post_details_chk_pending_public` CHECK (((`pending_public_due_at` is null) = (`pending_public_by` is null)));

CREATE TABLE `org_pending_public_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `post_id` bigint unsigned NOT NULL,
  `org_id` bigint unsigned NOT NULL,
  `action` enum('started','cancelled','skipped') COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_disposal_confirmed` tinyint(1) NOT NULL DEFAULT '0',
  `actor_user_id` bigint unsigned NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_org_pending_public_events_post` (`post_id`,`created_at`),
  KEY `idx_org_pending_public_events_org` (`org_id`,`created_at`),
  KEY `idx_org_pending_public_events_actor` (`actor_user_id`),
  CONSTRAINT `fk_org_pending_public_events_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_pending_public_events_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_org_pending_public_events_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
