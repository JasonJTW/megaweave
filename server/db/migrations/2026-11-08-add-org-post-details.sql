-- Org item details (#136, PRD 0001 §5.1 E3/E4/E6, ADR 0005).
-- One row per org post (posts.org_id IS NOT NULL). Personal posts have no row.
--
-- `org_category` is a CategoryId from server/src/services/avoidedEmissions/factorTable.ts
-- (CATEGORY_IDS). Weights and CO2e factors live in that table with their sources; they are
-- not copied here, so the report (#143) always runs estimateReport() on the factor table.
-- The app validates `org_category`; it is not a DB enum so a new category needs no migration.
--
-- `unit_weight_kg` is the per-item weight the Unit Contact submitted (the form prefills the
-- category default, ADR 0005). `weight_is_default` records whether it still equals that
-- default, so the report can show the default-weight share (ADR 0005 Consequences).

CREATE TABLE `org_post_details` (
  `post_id` bigint unsigned NOT NULL,
  `org_category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL,
  `unit_weight_kg` decimal(10,3) NOT NULL,
  `weight_is_default` tinyint(1) NOT NULL DEFAULT '0',
  -- Property / asset number (E4-1); a Public release needs Org Admin confirmation when set
  `asset_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  -- Estimated value in TWD (E6-2), optional
  `estimated_value_twd` int unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`),
  KEY `idx_org_post_details_category` (`org_category`),
  CONSTRAINT `fk_org_post_details_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `org_post_details_chk_quantity` CHECK ((`quantity` >= 1)),
  CONSTRAINT `org_post_details_chk_weight` CHECK ((`unit_weight_kg` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
