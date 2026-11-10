-- A Pending Public item can become invalid during its 10-minute delay. Keep an
-- append-only outcome so the Org Admin can see why it did not become Public.
ALTER TABLE `org_pending_public_events`
  MODIFY COLUMN `action` enum('started','cancelled','skipped','blocked') COLLATE utf8mb4_unicode_ci NOT NULL;
