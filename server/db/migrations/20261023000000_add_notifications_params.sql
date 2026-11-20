-- migrate:up
-- Event params (actorName, postTitle, ...) so the client renders the notification
-- in the reader's language from `type + params`. Rows without params (written
-- before this migration) keep showing the stored `title` / `content`.
ALTER TABLE `notifications`
  ADD COLUMN `params` json DEFAULT NULL AFTER `content`;

-- migrate:down
-- Never rolled back: fix forward with a new migration (ADR 0009).
