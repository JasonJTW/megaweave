# Weave 的兩造以物品流向儲存，不以發文者 / 回應者儲存

`weaves` 表用 `giver_id` / `receiver_id` 記錄一次交換的兩造。這兩欄描述的是**物品的流向**（從誰那裡出去、到誰手上），不是誰發了文，也不是所有權是否移轉。

因此 Giver 在 Wish 貼文上**不是** Post Author：小美發 Wish 徵求嬰兒床、阿明回應，物品從阿明流向小美，所以 `giver_id` 是阿明（Initiator），`receiver_id` 才是小美。Share 貼文則相反。這看起來像 bug，但是刻意的 —— 請不要「修正」它。

流程角色另有一組詞：Initiator（送出 Weave 請求的一方）與 Post Author（審核的一方），這組**不會**隨貼文類型翻轉。兩組詞互相垂直，定義見 `CONTEXT.md`。

## Considered Options

改存 `author_id` / `responder_id`，讓 Giver / Receiver 在讀取時依貼文類型推導。這樣新人讀 schema 不會誤會，但每一次「誰該把東西交給誰」的查詢都要先取得 Post 類型才能解讀。我們選了物品流向，因為交換本身才是這張表的主題，發文順序只是它的起因。

## Consequences

Commons（地球公物）沿用同一組欄位：保管者是 Giver，借用者是 Receiver，因為借出當下物品的流向與 Share 完全相同。Commons 與 Share 的差異在於**多一段回程**，那應該用額外的狀態與歸還期限表達，而不是新增一組兩造欄位。
