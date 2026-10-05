-- Account language for server-generated text (emails). Updated only when the user
-- switches language with the language switcher; visiting /en does not change it.
ALTER TABLE `users`
  ADD COLUMN `locale` enum('zh-TW','en') NOT NULL DEFAULT 'zh-TW' AFTER `public_id`;
