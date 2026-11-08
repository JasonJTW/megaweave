-- Per-item Auto Release override (#139, PRD 0001 §5.1 E2-3, ADR 0003).
--
-- The org setting lives on organizations.auto_release_enabled / auto_release_days.
-- An item may override it:
--   auto_release_override NULL     → follow the org
--   auto_release_override 'auto'   → release after auto_release_days, even if the org is manual
--   auto_release_override 'manual' → never release automatically
-- auto_release_days is set exactly when the override is 'auto' (CHECK).
-- Only Internal → Members is ever automatic; Public stays manual.

ALTER TABLE `org_post_details`
  ADD COLUMN `auto_release_override` enum('auto','manual') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `estimated_value_twd`,
  ADD COLUMN `auto_release_days` smallint unsigned DEFAULT NULL AFTER `auto_release_override`,
  ADD CONSTRAINT `org_post_details_chk_auto_release` CHECK ((`auto_release_days` IS NOT NULL) = (`auto_release_override` <=> 'auto')),
  ADD CONSTRAINT `org_post_details_chk_auto_release_days` CHECK (((`auto_release_days` IS NULL) OR (`auto_release_days` BETWEEN 1 AND 365)));
