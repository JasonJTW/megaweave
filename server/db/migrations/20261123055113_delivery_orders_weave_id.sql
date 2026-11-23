-- migrate:up
-- Which Weave a delivery order serves. Who may see and track the order follows the
-- Weave's Giver and Receiver (ADR 0001) instead of the post author. Old orders are
-- linked only when exactly one Approved or Completed Weave on the post has the orderer
-- as a party; ambiguous ones stay NULL and keep the old orderer-or-post-author rule.
ALTER TABLE `delivery_orders`
  ADD COLUMN `weave_id` bigint unsigned DEFAULT NULL COMMENT '這張外送單服務的 Weave（兩造可查看）；NULL = 舊單無法唯一對應' AFTER `post_id`,
  ADD KEY `idx_weave_id` (`weave_id`);

UPDATE `delivery_orders` d
JOIN (
  SELECT d2.id AS delivery_order_id, MIN(w.id) AS weave_id
  FROM `delivery_orders` d2
  JOIN `weaves` w
    ON w.post_id = d2.post_id
   AND w.status IN ('approved', 'completed')
   AND (w.giver_id = d2.user_id OR w.receiver_id = d2.user_id)
  GROUP BY d2.id
  HAVING COUNT(*) = 1
) m ON m.delivery_order_id = d.id
SET d.weave_id = m.weave_id
WHERE d.weave_id IS NULL;

-- migrate:down
-- Never rolled back: fix forward with a new migration (ADR 0009).
