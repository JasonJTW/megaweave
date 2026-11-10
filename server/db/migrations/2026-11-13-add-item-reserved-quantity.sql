-- Approving a Weave reserves stock (server/src/utils/weaveService.ts).
--
-- items.quantity stays the stock still on hand (not handed over yet); it drops only when a
-- Weave completes. items.reserved_quantity is the part of it promised to Approved Weaves:
--   approve   — reserved += requested, refused when quantity - reserved < requested
--   cancel    — reserved -= requested
--   complete  — quantity -= requested, reserved -= requested
-- Every change happens under SELECT ... FOR UPDATE on the items row, so two approvals of the
-- same item can't both take the last units.
--
-- The backfill counts the Weaves that are Approved now, so they release their reservation
-- when they are cancelled or completed after this deploy. Existing over-approvals (more
-- approved than in stock) backfill as they are: available shows 0 until some are closed.

ALTER TABLE `items`
  ADD COLUMN `reserved_quantity` int NOT NULL DEFAULT '0'
    COMMENT '已核准、尚未完成的交織預留的數量；可申請數量 = quantity - reserved_quantity' AFTER `quantity`;

UPDATE `items` i
JOIN (
  SELECT wi.item_id, SUM(wi.quantity) AS reserved
  FROM `weave_items` wi
  JOIN `weaves` w ON w.id = wi.weave_id
  WHERE w.status = 'approved' AND wi.item_id IS NOT NULL
  GROUP BY wi.item_id
) r ON r.item_id = i.id
SET i.reserved_quantity = r.reserved;
