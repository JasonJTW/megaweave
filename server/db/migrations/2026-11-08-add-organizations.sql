-- Organizations, units and memberships (ADR 0003, PRD 0001 §5.1).
-- Accounts stay platform-wide: org identity is a membership on the account.
-- `access_level` decides what a member can see, `org_role` what they can manage.
-- A membership can be the Unit Contact of several units (org_unit_contacts).
--
-- Posts gain `org_id`, `org_unit_id` and `audience_tier`. Existing rows get
-- `org_id = NULL` and `audience_tier = 'public'`, so personal posts behave as before.

CREATE TABLE `organizations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  -- How Public-tier posts show the poster: org name (default), org + unit, or anonymous (ADR 0004)
  `publisher_display` enum('org','org_unit','anonymous') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'org',
  -- Only demo orgs may skip the 10-minute Pending Public period (ADR 0003)
  `is_demo` tinyint(1) NOT NULL DEFAULT '0',
  `auto_release_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `auto_release_days` smallint unsigned NOT NULL DEFAULT '30',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_organizations_public_id` (`public_id`),
  CONSTRAINT `organizations_chk_auto_release_days` CHECK ((`auto_release_days` >= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `org_units` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `org_id` bigint unsigned NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- Target of the composite foreign keys that keep a unit inside its own org
  UNIQUE KEY `uq_org_units_org_id_id` (`org_id`,`id`),
  UNIQUE KEY `uq_org_units_org_id_name` (`org_id`,`name`),
  CONSTRAINT `fk_org_units_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `org_memberships` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `org_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `access_level` enum('internal','member') COLLATE utf8mb4_unicode_ci NOT NULL,
  `org_role` enum('admin','staff','member') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
  -- Verified separately from the sign-in email; NULL in the prototype (members are matched by sign-in email)
  `org_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_org_memberships_org_user` (`org_id`,`user_id`),
  UNIQUE KEY `uq_org_memberships_org_id_id` (`org_id`,`id`),
  KEY `idx_org_memberships_user_id` (`user_id`),
  CONSTRAINT `fk_org_memberships_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  CONSTRAINT `fk_org_memberships_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unit Contacts: one membership can represent several units of the same org
CREATE TABLE `org_unit_contacts` (
  `org_id` bigint unsigned NOT NULL,
  `org_unit_id` bigint unsigned NOT NULL,
  `membership_id` bigint unsigned NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`org_unit_id`,`membership_id`),
  KEY `idx_org_unit_contacts_membership` (`org_id`,`membership_id`),
  CONSTRAINT `fk_org_unit_contacts_unit` FOREIGN KEY (`org_id`,`org_unit_id`) REFERENCES `org_units` (`org_id`,`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_org_unit_contacts_membership` FOREIGN KEY (`org_id`,`membership_id`) REFERENCES `org_memberships` (`org_id`,`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Org posts belong to a unit; `user_id` stays the person who listed it.
-- Personal posts: org_id and org_unit_id NULL, audience_tier 'public'.
ALTER TABLE `posts`
  ADD COLUMN `org_id` bigint unsigned DEFAULT NULL AFTER `user_id`,
  ADD COLUMN `org_unit_id` bigint unsigned DEFAULT NULL AFTER `org_id`,
  ADD COLUMN `audience_tier` enum('internal','members','public') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public' AFTER `org_unit_id`,
  ADD KEY `idx_posts_org_tier` (`org_id`,`audience_tier`),
  ADD KEY `idx_posts_audience_tier` (`audience_tier`),
  ADD CONSTRAINT `fk_posts_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  ADD CONSTRAINT `fk_posts_org_unit` FOREIGN KEY (`org_id`,`org_unit_id`) REFERENCES `org_units` (`org_id`,`id`),
  ADD CONSTRAINT `posts_chk_org_unit` CHECK (((`org_id` IS NULL) = (`org_unit_id` IS NULL))),
  ADD CONSTRAINT `posts_chk_personal_public` CHECK (((`org_id` IS NOT NULL) OR (`audience_tier` = 'public')));
