-- Receiving unit of an org Weave (#137, PRD 0001 §5.1, ADR 0004).
--
-- `receiver_id` stays the person who handles the hand-over; `receiver_org_unit_id` is the
-- unit the item flows to, chosen by the requester ("on behalf of a unit" or "myself") when
-- the request is sent. It mirrors posts.user_id (handler) / posts.org_unit_id (owner).
-- It is recorded, not derived from membership, so the flow record (PRD E9) does not change
-- after a Unit Contact leaves or moves unit.
--
-- Personal Weaves (and personal requests on org items) keep NULL; existing rows get NULL,
-- so their behaviour is unchanged. The app checks that the unit belongs to the post's org
-- and is one the requester is a Unit Contact of (server/src/services/orgWeaveService.ts).
-- No ON DELETE: a unit with Weave history must not disappear from that history.

ALTER TABLE `weaves`
  ADD COLUMN `receiver_org_unit_id` bigint unsigned DEFAULT NULL
    COMMENT '物品流向的單位（申請人送出時選擇；個人 Weave 為 NULL，見 ADR 0004）' AFTER `receiver_id`,
  ADD KEY `idx_weaves_receiver_org_unit` (`receiver_org_unit_id`),
  ADD CONSTRAINT `fk_weaves_receiver_org_unit` FOREIGN KEY (`receiver_org_unit_id`) REFERENCES `org_units` (`id`);
