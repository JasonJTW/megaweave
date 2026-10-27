-- Event params (actorName, postTitle, ...) so the client renders the notification
-- in the reader's language from `type + params`. Rows without params (written
-- before this migration) keep showing the stored `title` / `content`.
ALTER TABLE `notifications`
  ADD COLUMN `params` json DEFAULT NULL AFTER `content`;
