-- Org conversations (#140, ADR 0004).
--
-- People who message or request a Public org item talk to the handling Unit Contact's personal
-- account (posts.user_id), but must never learn who that is: the conversation shows the org name.
-- A pair of users could already have a personal conversation, and conversations were unique per
-- pair, so an org chat would have merged into it and revealed the contact. Org chats are now a
-- separate conversation per (pair, org):
--   org_id       the org the conversation is about; NULL = personal conversation (as before)
--   org_user_id  the org-side participant (the handling contact). A viewer who is not a member
--                of org_id sees that participant as the org, never their name, avatar or ids.
--   org_key      IFNULL(org_id, 0), so the unique key still allows one personal conversation per
--                pair (a NULL in a unique key would allow duplicates).

ALTER TABLE `conversations`
  ADD COLUMN `org_id` bigint unsigned DEFAULT NULL AFTER `user2_id`,
  ADD COLUMN `org_user_id` bigint unsigned DEFAULT NULL AFTER `org_id`,
  ADD COLUMN `org_key` bigint unsigned GENERATED ALWAYS AS (ifnull(`org_id`,0)) STORED AFTER `org_user_id`,
  ADD UNIQUE KEY `idx_conversation_users_org` (`user1_id`,`user2_id`,`org_key`),
  DROP INDEX `idx_conversation_users`,
  ADD KEY `idx_conversations_org` (`org_id`),
  ADD CONSTRAINT `fk_conv_org` FOREIGN KEY (`org_id`) REFERENCES `organizations` (`id`),
  ADD CONSTRAINT `fk_conv_org_user` FOREIGN KEY (`org_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `check_conv_org_user` CHECK (((`org_id` is null) = (`org_user_id` is null)));
