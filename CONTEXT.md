# Megaweaving (大量交織)

一個免費的物品交換 / 物資共享平台。使用者張貼自己有的或想要的物品，配對成功後由雙方完成一次實體交換。

## Language

### 貼文

**Post**:
使用者張貼的一則物品供需訊息。是平台上所有交換的起點。
_Avoid_: Listing, Ad, 商品

**Share**:
「我有，可以給出去」的 Post。
_Avoid_: Offer, Donation, 贈送

**Wish**:
「我想要」的 Post。
_Avoid_: Request, Want, 徵求

**Commons (地球公物)**:
開放給社群**借用**的物品：提供出來，由他人在約定時間內領取使用。與 Share 的差別在於物品會回到提供者手上，所有權不移轉。
_Avoid_: Loan, Lending, 共享物

**Item**:
一則 Post 裡列出的具體物品與數量。一個 Weave 可以只針對其中幾個 Item，不必涵蓋整則 Post。

### 交換

**Weave (交織)**:
一次物品交換的完整關係，從提出請求那一刻就存在，不是配對成功後才誕生。
_Avoid_: Transaction, Trade, Deal, Order, 訂單

**Giver**:
在這次 Weave 中把物品交出去的一方。
_Avoid_: Donor, Seller, Owner

**Receiver**:
在這次 Weave 中拿到物品的一方。
_Avoid_: Recipient, Buyer, Claimer

**Initiator**:
送出 Weave 請求的一方。與 Giver / Receiver 垂直：Initiator 是誰由「誰先開口」決定，不由物品流向決定。
_Avoid_: Requester, Sender

**Post Author**:
張貼該 Post、因而負責 approve 或 decline 進來的 Weave 請求的一方。永遠是 Initiator 的對造。
_Avoid_: Poster, Owner, 發文者

> Giver / Receiver 隨 Post 類型翻轉，Initiator / Post Author 不會：
> Share → Post Author 是 Giver；Wish → Post Author 是 Receiver。

### Weave 狀態

**Requested**:
Weave 已提出，等待 Post Author 回應。

**Approved**:
Post Author 已同意，交換進行中，等待雙方各自 Confirm。
_Avoid_: Pending, In progress

**Confirm**:
單方表示自己這一側的交換已完成。兩方都 Confirm 後 Weave 才 Complete；單方 Confirm 不改變 Weave 狀態。

**Completed**:
雙方都已 Confirm，交換結束。

**Declined**:
Post Author 拒絕了這次 Weave 請求。
_Avoid_: Rejected, Refused

**Cancelled**:
Weave 在完成前被一方中止。

### 探索

**Feed**:
呈現給使用者的 Post 排序結果，混合語意相似度與熱度。
_Avoid_: Timeline, Stream

**Hot Score**:
一則 Post 的熱度分數，用於 Feed 排序。不等於按讚數。
