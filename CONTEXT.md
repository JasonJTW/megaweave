# Megaweaving (大量交織)

一個免費的物品交換 / 物資共享平台。使用者張貼自己有的或想要的物品，配對成功後由雙方完成一次實體交換。

## Language

### 貼文

**Post**:
使用者張貼的一則物品供需訊息。是平台上所有交換的起點。
_Avoid_: Listing, Ad, 商品

**Share (分享)**:
「我有，可以給出去」的 Post。
_Avoid_: Offer, Donation, 贈送

**Wish (許願)**:
「我想要」的 Post。
_Avoid_: Request, Want, 徵求

**Commons (地球公物)**:
永久開放給社群**借用**的物資。「溢出」端的提供者建立 Share 時勾選「地球公物」，該物資即成為公共資源，不再屬於任何個人。
採**分散式暫存**：物資沒有中央倉庫，由當下持有的使用者（Custodian）在使用期限內保管。
與 Share 的差別：Share 是一次性送出，Commons 會一直在使用者之間流轉。
_Avoid_: Loan, Lending, 共享物, Common Share, Share Commons

**Custodian (上家)**:
Commons 目前的保管者，負責在使用期限內保管該物資。透過 Weave 把物資交給下一位 Receiver（下家）後，下家成為新的 Custodian，原 Custodian 的責任結束。
_Avoid_: Owner, Holder, Lender

**In Use (使用中)**:
Commons 的預設狀態。Custodian 正在使用，Commons 仍會出現在搜尋結果中，但必須標注「使用中」狀態與 Current Holder（目前保管者），且不可被請求。

**Releasable (可釋出)**:
Custodian 勾選「可釋出」或「x月x日可釋出」後的狀態。此時系統才開放 Wish 使用者請求該物資；指定日期者，到期日起才可被請求。

**Current Holder (目前保管者)**:
搜尋結果與詳情頁上標示的 Commons 現任 Custodian，讓需求者知道物資在誰手上。

> Commons 的流轉：提供者勾選地球公物 → Custodian 保管（In Use，可被搜尋但不可請求）→ 標示 Releasable（開放請求）→ 新使用者經 Weave 取得 → 成為新 Custodian。物資不會回到最初的提供者手上。

**Item**:
一則 Post 裡列出的具體物品與數量。一個 Weave 可以只針對其中幾個 Item，不必涵蓋整則 Post。

### 交換

**Weave (交織)**:
一次物品交換的完整關係，從提出請求那一刻就存在，不是配對成功後才誕生。
_Avoid_: Transaction, Trade, Deal, Order, 訂單

**Giver (提供者)**:
物品從這一方**流出**。描述的是物品的方向，不是所有權移轉 —— Commons 的 Custodian 在該次 Weave 中是 Giver。
_Avoid_: Donor, Seller, Owner, 贈送者, 分享者

**Receiver (接收者)**:
物品**流入**這一方。同樣只描述方向 —— Commons 的下家在該次 Weave 中是 Receiver，Weave 完成後成為新的 Custodian。
_Avoid_: Recipient, Buyer, Claimer, 收受者

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
DB `weaves.status` 值為 `approved`。
_Avoid_: Pending, In progress

**Confirm**:
單方表示自己這一側的交換已完成。兩方都 Confirm 後 Weave 才 Complete；單方 Confirm 不改變 Weave 狀態。

**Completed**:
雙方都已 Confirm，交換結束。

**Declined (已婉拒)**:
Post Author 在 Requested 階段拒絕了這次 Weave 請求。不涉及違背承諾。
DB `weaves.status` 值為 `declined`。
_Avoid_: Rejected, Refused

**Withdrawn (已撤回)**:
Initiator 在 Requested 階段收回自己的請求。不涉及違背承諾。
_Avoid_: Cancelled（Requested 階段的退出不叫取消）

**Cancelled (已取消)**:
Weave 在 Approved 之後、Completed 之前被任一方中止。雙方已有約定，屬於違背承諾。
_Avoid_: Withdrawn, Aborted

> Requested 階段的退出由「誰」決定名稱（Initiator → Withdrawn，Post Author → Declined）；Approved 之後任一方退出都是 Cancelled。

### 探索

**Feed**:
呈現給使用者的 Post 排序結果，混合語意相似度與熱度。
_Avoid_: Timeline, Stream

**Hot Score**:
一則 Post 的熱度分數，用於 Feed 排序。不等於按讚數。
