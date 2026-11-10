# MegaWeaving 避免排放量估算模型（v2026-11-10）

> **用途**：E6-2「估算減碳量（CO2e）」報表（GitHub #136、#143；PRD 0001 §E6-2、§5.1）的計算方法、係數來源與方法學論證。研究背景見 [avoided-emissions-reuse-research.md](avoided-emissions-reuse-research.md)。
> **實作**：`server/src/services/avoidedEmissions/`（`factorTable.ts` 係數表、`avoidedEmissions.ts` 計算、`avoidedEmissions.test.ts` 26 項單元測試）；`server/src/scripts/checkEmissionFactors.ts` 對照環境部 API。
> **原始資料快照**：`docs/notes/data/moenv-cfp-p-02-2026-11-08.json`（環境部 CFP_P_02 全表 1,188 筆）、`docs/notes/data/epa-warm-v16-exhibit-1-1-excerpt-2026-11-08.csv`（WARM v16 Exhibit 1-1 摘錄）、`docs/notes/data/unu-ewaste-guidelines-ed3-annex6-average-weights-2026-11-08.csv`（UNU 指引第 3 版每台平均重量）與同版 UNU-KEY 定義表。EPD 與其他 PDF 只存在 session scratchpad，數值逐筆抄進 `factorTable.ts` 並註明表號。
> **係數表版本**：`FACTOR_TABLE_VERSION = "2026-11-10"`，每筆報表結果都帶這個版本號。2026-11-09 版把辦公椅參考產品從 4 份擴充為 9 份（新增 5 份亞洲製造或平價品牌 EPD，§4.4），辦公椅係數 4.122 → 3.441。2026-11-10 版把 BOM 中指名的 PU、POM、ABS、PVC 從 PP 代理改為環境部各自的係數（§4.2；先前誤記為「庫內無係數」，見 [moenv-open-data-api.md](moenv-open-data-api.md) §5.1），辦公椅 3.441 → 3.594、沙發 1.553 → 1.843。同日把壽命比 L 列為算式的獨立一項（§6.8），預設 1，報表數字不變，所以沿用同一版本號。

---

## 1. 模型一句話

**每件已完成交接的物品：避免排放量 = 重量 × 類別生產係數 × 取代率 × 壽命比**，報表並列「理想值（取代率 = 1、壽命比 = 1）」與「估算值（取代率 = 0.5、壽命比 = 1）」。

```
理想值  P (kgCO2e) = m × EF_c
估算值  A (kgCO2e) = m × EF_c × R_c × L_c

m     物品總重 (kg) = 單件重量 × 件數；單件重量由刊登者填寫，未填時用類別預設值
EF_c  類別 c 的新品生產排放係數 (kgCO2e/kg，搖籃到大門)
R_c   取代率：這件二手品實際取代一件新品生產的比例。預設 0.5，問卷樣本 ≥ 100 後改用實測值
L_c   壽命比：二手品在接手者手上的使用年限 ÷ 被取代新品的使用年限，範圍 (0, 1]。
      預設 1（WRAP 2011 like-for-like，§6.8），有實測資料後按類別替換

組織報表 = Σ 該組織已完成 Weave 的 Item（每次 Weave 只算一次）
```

類別生產係數 EF_c 依類別性質分三種來源：

| 類別性質 | EF_c 怎麼來 | 為什麼 |
|---|---|---|
| 家具（椅、桌、鋼櫃） | **min**（參考產品材質組成 × 環境部材質係數，參考產品 EPD 的 A1–A3 平均） | 台灣材質係數優先；用第三方查證的 EPD 封頂，確保不高於任何一個獨立估計 |
| 電子產品 | EPA WARM v16 產品級 source reduction 係數 | 電子產品排放集中在晶片與面板製造，材質法會嚴重低估；台灣資料庫沒有對應成品係數 |
| 其他有係數的類別 | 固定材質組成 × 環境部材質係數 | 單一材質為主（紙、PP、纖維、板材） |
| 小家電、其他 | **不計入**（回傳 0，報表列出件數） | 找不到可引用的係數，不猜值 |

---

## 2. 計算結果一覽（每件、用類別預設重量）

| 類別 | EF_c (kgCO2e/kg) | EF 依據 | 預設重量 (kg) | 理想值 P | 估算值 A (R=0.5) |
|---|---|---|---|---|---|
| 辦公椅 | 3.594 | 材質法（EPD 平均 5.092） | 13.8 | 49.6 | 24.8 |
| 辦公桌／會議桌 | 1.604 | EPD（材質法 1.980） | 37.4 | 60.0 | 30.0 |
| 木質櫃架 | 1.120 | 100% 木質板材 | 11 | 12.3 | 6.2 |
| 金屬櫃架 | 2.476 | 材質法（EPD 平均 3.043） | 16 | 39.6 | 19.8 |
| 沙發與軟墊座椅 | 1.843 | WRAP 2011 材質比例 | 37.7 | 69.5 | 34.7 |
| 桌上型電腦主機 | 22.994 | WARM Desktop CPUs | 6.26 | 143.9 | 72.0 |
| 筆電／平板 | 32.882 | WARM Portable Electronic Devices | 1.35 | 44.4 | 22.2 |
| 手機 | 32.882 | WARM Portable Electronic Devices | 0.08 | 2.6 | 1.3 |
| 螢幕／電視 | 26.665 | WARM Flat-Panel Displays | 8.2 | 218.7 | 109.3 |
| 印表機／事務機 | 8.433 | WARM Hard-Copy Devices | 12.13 | 102.3 | 51.1 |
| 電腦周邊 | 11.376 | WARM Electronic Peripherals | 0.4 | 4.6 | 2.3 |
| 塑膠收納與塑膠製品 | 1.950 | 100% PP | **無（必填）** | — | — |
| 書籍與紙本 | 1.377 | 100% 印刷書寫用紙 | 0.5 | 0.69 | 0.34 |
| 布品與衣物 | 4.420 | 棉紗（兩大纖維中較低者） | 0.25 | 1.10 | 0.55 |
| 小家電 | 不計入 | — | 無 | 0 | 0 |
| 其他 | 不計入 | — | 無 | 0 | 0 |

**試算範例**（一個組織一年的交接紀錄）：辦公椅 20 張（預設重）、辦公桌 10 張（預設重）、鐵櫃 5 個（實填 40 kg）、筆電 8 台（實填 1.6 kg）、螢幕 6 台（預設重）、書 50 本（預設重）、小家電 2 台（實填 3 kg）。

| 類別 | 件數 | 重量 (kg) | 理想值 (kgCO2e) | 估算值 (kgCO2e) |
|---|---|---|---|---|
| 辦公椅 | 20 | 276.0 | 992.0 | 496.0 |
| 辦公桌／會議桌 | 10 | 374.0 | 600.0 | 300.0 |
| 金屬櫃架 | 5 | 200.0 | 495.2 | 247.6 |
| 筆電／平板 | 8 | 12.8 | 420.9 | 210.4 |
| 螢幕／電視 | 6 | 49.2 | 1,311.9 | 656.0 |
| 書籍與紙本 | 50 | 25.0 | 34.4 | 17.2 |
| 小家電（不計入） | 2 | 6.0 | 0 | 0 |
| **合計** | 101 | **943.0**（其中預設重量 724.2） | **3,854.4** | **1,927.2** |

報表應同時揭露：預設重量占總重 77%、2 件小家電未計入。

---

## 3. 範圍、參考情境與功能單位

- **解決方案情境**：組織釋出的物品經 MegaWeaving 由另一人／單位接手繼續使用。
- **參考情境**（WBCSD 2023 §5.2 Step 2）：沒有這次交接時，接手方以機率 R 購買一件同類、同重量的新品；釋出方的物品照原本路徑處置。
- **功能單位**：一件完成交接的物品（重量 m kg），在接手方的一次使用期間。
- **系統邊界**：只計「被避免的新品生產」（原料取得＋製造，A1–A3）。使用階段、廢棄處置、運輸不計（理由見 §6.3–6.5）。
- **時間口徑**：前瞻式（WBCSD 2023 §5.3 Approach A），在 Weave 完成的年度一次認列整件新品的生產排放。
- **計算單位**：Weave 狀態為已完成的 Item。只有 Requested／Approved 的不算；一次 Weave 只算一次。

---

## 4. 係數來源

### 4.1 來源優先順序

1. **環境部碳足跡排放係數資料庫（CFP_P_02）**：台灣政府公告、政府資料開放授權第 1 版可引用與再散布；依《碳足跡排放係數資料庫審查標準作業流程》（環境部氣候變遷署，2025-10）商品係數為搖籃到大門。用於所有材質係數。
2. **US EPA WARM v16（2023-12）**：美國政府公有領域文件，方法公開。只用於電子產品，因為環境部資料庫沒有電腦、螢幕、印表機成品係數（只有一筆 Acer 11.6 吋筆電 81 kgCO2e/台，單位是「台」）。
3. **第三方查證 EPD**（ISO 14025／EN 15804／BIFMA PCR）：提供家具的材質組成與 A1–A3 實測值，用來推材質比例並封頂。
4. **找不到 → 不計入**。研究筆記 §8 已決定「無係數的類別列為不計入而非猜值」；GC贈物網把 97 個類別直接套同一個預設值（研究筆記 §2.6）正是要避免的反例。

### 4.2 環境部材質係數（13 筆，2026-11-08 以 API 抓取，2026-11-10 補 4 筆塑膠）

選值規則：①名稱最貼近該材質的記錄；②同樣貼近時取公告年較新者（審查 SOP「應優先引用年份較新之係數」）；③同年取較低值。

| 材質 id | 引用記錄 `name` | 公告年 | 公告單位 | kgCO2e/kg | 選擇理由與備註 |
|---|---|---|---|---|---|
| steel | 碳鋼冷軋鋼捲 | 2013 | 環境部 | 2.5 | 同年中鋼「冷軋鋼捲」2.94 為單一廠商值；取環境部通用值且較低者。不鏽鋼零件也套此值（偏保守） |
| aluminium | 鋁錠 | 2013 | 經濟部工業局 | 9.8493 | 原生鋁。家具壓鑄鋁常含再生料（「再生鋁錠」0.7，2015），見 §7 敏感度 |
| polyamide | 聚醯胺6 | 2013 | 經濟部工業局 | 3.83 | 辦公椅椅腳多為 PA6；聚醯胺66（7.21）、聚醯胺粒（7.1）名稱較不貼近 |
| polypropylene | 聚丙烯(PP) | 2023 | 環境部 | 1.95 | 同名 2013 年 2.01，取較新者（研究筆記寫的 2.01 已過時） |
| polyurethane | 聚氨基甲酸乙酯樹脂 | 2025 | 環境部氣候變遷署 | 5.211 | 庫內沒有軟質 PU 泡棉；此記錄名稱最貼近（台灣此品名多指合成皮用 PU 樹脂）。同名 2015 年 3.17，取較新者。用於 BOM 的 PU、PUR、Foam |
| polyoxymethylene | 聚甲醛 | 2013 | 經濟部工業局 | 1.723 | 庫內唯一一筆 |
| abs | 丙烯腈-丁二烯-苯乙烯共聚合物 | 2025 | 環境部氣候變遷署 | 2.788 | 原生 ABS；「ABS再生塑膠粒」0.57（2019，單一廠商）是再生料，不採用 |
| pvc | 聚氯乙烯 | 2025 | 環境部氣候變遷署 | 2.571 | 同名 2021 年 3.02，取較新者；PVC 均一粉 2.851、微懸浮乳化粉 2.449 名稱較不貼近 |
| plastic_unspecified | 聚丙烯(PP) | 2023 | 環境部 | 1.95 | 只用於 EPD 未指名的塑膠（other plastics、plastic components、other polymers）、庫內沒有的彈性體（熱塑性聚酯彈性體、共聚酯醚），以及未標明 LDPE／HDPE 的 PE（LDPE 1.9、HDPE 2.21，PP 介於兩者之間） |
| wood_panel | 中密度纖維板 | 2015 | 經濟部工業局「103年製造業產品碳足跡輔導與推廣計畫」 | 1.12 | 庫內無粒片板、合板；粒片板以 MDF 代理。實木無台灣係數，BOM 中計 0 |
| polyester_fibre | 聚酯棉 | 2020 | 環境部 | 4.45 | 同名 2016 年 4.17，取較新者。纖維級，不含織布染整 |
| cotton_yarn | 天然棉混紡紗 | 2017 | 環境部 | 4.42 | 紗線級，不含織布染整 |
| paper | 未塗布印刷書寫用紙 | 2025 | 環境部氣候變遷署 | 1.377 | 紙張級，不含印刷裝訂 |

2026-11-09 版之前，PU、POM、ABS、PVC 都以 PP 代理，理由寫成「庫內無係數」。這是搜尋錯誤：庫內用中文全名，搜英文縮寫找不到。這四筆記錄在 2026-11-08 的快照裡都已存在。

`avoidedEmissions.test.ts` 逐字比對這 13 筆與 repo 內快照；`npm run check:emission-factors` 比對線上 API 並列出同名的較新年度記錄（§9）。

### 4.3 EPA WARM v16 電子產品係數

來源：*Documentation for GHG Emission and Energy Factors Used in WARM v16*，Management Practices 章 Exhibit 1-1（p.1-2）與 Electronics 章 Exhibit 1-5（p.1-4）、Exhibit 1-7（p.1-7），Net Source Reduction Emissions for Current Mix of Inputs。電子產品的 current mix 即 100% 原生料（Electronics 章 Exhibit 1-5 註 a）。換算：1 MTCO2E/short ton = 1000 ÷ 907.18474 = 1.10231 kgCO2e/kg。

| WARM 項目 | 定義（Electronics 章 p.1-1） | MTCO2E/short ton | kgCO2e/kg | 用於 |
|---|---|---|---|---|
| Desktop CPUs | 桌機主機，不含螢幕與周邊 | 20.86 | 22.994 | 桌上型電腦主機 |
| Portable Electronic Devices | 筆電、電子書、平板、智慧型與功能型手機 | 29.83 | 32.882 | 筆電／平板、手機 |
| Flat-Panel Displays | LED/LCD 電視、電漿電視、LED/LCD 電腦螢幕 | 24.19 | 26.665 | 螢幕／電視 |
| Electronic Peripherals | 鍵盤、滑鼠 | 10.32 | 11.376 | 電腦周邊 |
| Hard-Copy Devices | 印表機、多功能事務機 | 7.65 | 8.433 | 印表機／事務機 |

引用 WARM 的兩個依據：
- Management Practices §1.3.2：「the GHG emissions generated by the production of materials can be calculated by taking the absolute value of WARM's source reduction factors」，所以取絕對值就是新品生產排放。
- Electronics §1.4.1：「finding alternatives to purchasing new electronics (e.g., using a donated product) are examples of source reduction」，捐贈品取代新品正是 MegaWeaving 的情境。

不用 WARM 算家具與紙類：WARM 的紙與木材 source reduction 含美國森林碳儲存信用（Management Practices §1.2），MDF −2.41、Office Paper −7.95 MTCO2E/short ton，與環境部搖籃到大門口徑不同，不能混用。

台灣交叉檢核：環境部 Acer 11.6 吋筆電 81 kgCO2e/台（2016）；WARM 32.882 kgCO2e/kg × 預設 1.35 kg = 44.4，低於台灣值，表示 WARM 每公斤係數配上 UNU 2024 平均重量不會高估（單元測試鎖住這個不等式）。

### 4.4 家具參考產品（EPD）

**什麼是 EPD**：環境產品宣告（Environmental Product Declaration），是廠商依 ISO 14025 對單一產品做生命週期評估（LCA），由獨立第三方查證後公開的文件。同類產品依同一份產品類別規則（PCR，例如 BIFMA PCR for Seating、EN 15804 + c-PCR-021 Furniture）計算，通常 5 年有效。結果分階段列出：A1–A3 是原料取得、運輸到廠、製造（搖籃到大門），之後是 A4 運送、B 使用、C 廢棄、D 回收效益。本模型從 EPD 取兩樣東西：**材質表**（推算平均產品的材質比例，乘環境部係數）與 **A1–A3 GWP**（封頂值）。只取 A1–A3，因為再使用避免的就是一件新品的生產。

元件重量逐筆抄自各 EPD 的材質表；`factorTable.ts` 的 `REFERENCE_PRODUCTS` 保留原始標籤。無台灣係數的元件（玻纖、再生料、羊毛、未揭露纖維種類的布料、粉體塗料、膠、其他）計 0 但保留在總重中，會拉低係數（偏保守）。

**辦公椅納入條件**（2026-11-09 起；沒有任何方法學指定參考產品，eBay × Anthesis 與 IVL 只要求「代表性產品」，以下是本模型自訂的條件）：
1. 第三方查證、在 2026-11-09 仍有效的 EPD（NSF、EPD International、EPD-Norge 等 ISO 14025 計畫）。
2. 一般辦公任務椅，不含高腳椅（stool）、休閒椅、會議椅。
3. 同一個配置同時揭露材質表（kg）與 A1–A3 GWP，兩者對得起來。
4. 一份 EPD 只取一個配置：EPD 標明「most representative」的配置優先；否則取最輕、A1–A3 最低的任務椅配置（避免同一產品重複加權，也偏保守）。
5. 為了接近台灣市場，2026-11-09 增補的樣本限亞洲製造或平價品牌。

**搜尋範圍與排除**（2026-11-09）：
- 台灣：環境部「台灣產品碳足跡資訊」（`cfp_p_01`，938 筆有效碳標籤）與 CFP_P_02 係數庫（1,188 筆）都沒有椅子或家具產品；環境部也沒有辦公家具的碳足跡產品類別規則（只有竹製家具 23-015），廠商無規則可申請碳標籤。逐家查過的台灣主流品牌：
  - Ergohuman（聯友椅業，廣東生產）：Elite、Project Mirus、Project Ergohuman 三款有 SGS 依 ISO 14067 查證的搖籃到大門碳足跡聲明，但 kgCO2e 未公開，官網註明向業務索取（<https://www.comfort.global/ergohuman-environmental-product-declarations>）。產品頁公開材質比例（Elite G2 鋁合金 61%），若納入，辦公椅係數會上升。不是 ISO 14025 EPD，目前不符條件 1。
  - 震旦家具：只有公司層級碳足跡核算與 DNV 碳中和證書，沒有單一產品數字。
  - 大將作、Backbone、歐德、吉加吉：沒有找到 EPD 或碳足跡。
- 台灣常見的日韓品牌與代工：Okamura、SIDIZ 沒有公開 EPD；永藝（中國代工）2025 永續報告揭露兩款辦公椅做過 ISO 14067 查證，未列數字；《人民日報》2024-02-17 報導的杭州人體工學椅 63.59 kgCO2e 沒有廠商、重量與材質，無法使用。
- Atwoka（中國，EPD-IES-0017624）：只公布五款中「worst case」的一組結果，沒說是哪一款，材質表與 GWP 對不起來，違反條件 3。
- Steelcase Think、Personality Plus 的 stool 配置：違反條件 2；Think 的馬來西亞配置：同一產品已取印度配置（條件 4）。
- Haworth Very、Zody、Soji 的亞太版（EPD-IES-0013323、0006186、0013322）：符合條件但尚未逐份核對，Haworth 亞太已有 Aloha Active 一份，留待下一版。
- IKEA MARKUS、FLINTAN 等平價椅：找不到公開 EPD。

| 類別 | 產品（EPD 編號） | 重量 kg | EPD A1–A3 kgCO2e | EPD 取值位置 |
|---|---|---|---|---|
| 辦公椅 | Steelcase Series 1（NSF EPD10930，2024） | 13.787 | 74.1 | Materials acquisition 55.7 + Production 18.4（TRACI） |
| 辦公椅 | Herman Miller Aeron 鋁椅腳（NSF EPD10431，2022） | 20.63 | 58.0 | CML 表 GWP A1-A3 |
| 辦公椅 | Haworth Soji 歐洲製（EPD-IES-0012459:006，2025） | 19.0 | 142 | EN 15804+A2 表 GWP-GHG A1-A3（grid） |
| 辦公椅 | Kinnarps Task Chair 6240（NEPD-3617-2541-EN，2022） | 20.03 | 79.4 | Key environmental indicators A1-A3 |
| 辦公椅 | Steelcase Personality Plus 任務椅 APAC，印度製（NSF EPD11108，2025） | 17.77 | 76.8 | Task chair configuration：Materials acquisition 64.3 + Production 12.5（GWP excl. biogenic） |
| 辦公椅 | Steelcase Think APAC 任務椅，印度製（NSF EPD11087，2025） | 17.033 | 105.3 | India configuration：Materials acquisition 86.0 + Production 19.3 |
| 辦公椅 | Haworth Aloha Active 網背，上海／清奈製（EPD-IES-0013321:003，2025） | 15.34 | 88.3 | IPCC AR6 GWP excl biogenic：Material Acquisition 70.4 + Production 17.9 |
| 辦公椅 | KOKUYO No. 16 Chair，印度製（EPD-IES-0015164:002，2026） | 14.9 | 81.9 | GWP-GHG A1-A3 |
| 辦公椅 | Almachair ATLANTA，中國廣東代工（EPD-IES-0026478:001，2025） | 19.71 | 99.7 | GWP-GHG A1-A3 |
| 辦公桌 | Haworth YourPlace Core 1600×800 固定高度（EPD-IES-0015450:003，2025） | 37.4 | 60.0 | EN 15804+A2 表 GWP-GHG A1-A3（grid） |
| 金屬櫃架 | Bisley Glide 拉門鋼櫃最小尺寸（S-P-01613，2019，已過期 2024-08-28） | 31 | 88.1 | GWP fossil：Upstream 77.2 + Core 10.9 |
| 金屬櫃架 | Bisley Note 活動櫃最小尺寸（S-P-01616，2019，已過期 2024-08-28） | 16 | 54.94 | GWP fossil：Upstream 45.2 + Core 9.74 |

材質對應的兩個判斷：KOKUYO「Nylon + glass fibre」6 kg 未揭露玻纖比例，比照 Kinnarps PAGF30 以 70/30 拆分、玻纖部分不計；ATLANTA 的「PCR PA」1.2 kg 是再生尼龍，比照 Aeron 的 Recycled PET 不套原生係數。

沒有找到固定高度辦公桌以外的 EPD 時，不採用升降桌 EPD（Steelcase Migration Intro、Kinnarps Series P 都含馬達與加厚鋼架，與台灣常見的 OA 桌不同）。

### 4.5 預設重量

規則：多個獨立來源時取最輕者；同一資料集有新舊版本時用最新版（同環境部 SOP「優先引用年份較新」）；找不到來源或來源不保守時不給預設值，表單必填。電子產品取 UNU 指引第 3 版 Annex 6（Table 25，p.163，2026，CC BY 4.0）的 2024 年每台平均重量，該表不含電池（偏輕）。快照：`docs/notes/data/unu-ewaste-guidelines-ed3-annex6-average-weights-2026-11-08.csv`，代碼定義見同目錄 `unu-ewaste-guidelines-ed3-unu-keys-v2-2026-11-08.csv`；由 Zenodo API `GET https://zenodo.org/api/records/18328494` 取得檔案清單後下載。

| 類別 | 預設 kg | 來源與位置 |
|---|---|---|
| 辦公椅 | 13.8 | 九份辦公椅 EPD 中最輕者（Steelcase Series 1，13.787） |
| 辦公桌／會議桌 | 37.4 | Haworth YourPlace Core EPD |
| 木質櫃架 | 11 | CRA 2020 §6「Other Home Furniture under 15kg」平均 11 kg（FRN 2009），兩級中較輕者 |
| 金屬櫃架 | 16 | Bisley Note 活動櫃 EPD 最小尺寸 |
| 沙發與軟墊座椅 | 37.7 | CRA 2020 §6 Upholstered Furniture |
| 桌上型電腦主機 | 6.26 | UNU-KEY 0302 Desktop PCs，2024 |
| 筆電／平板 | 1.35 | UNU-KEY 0303 Laptops (incl. tablets)，2024。舊版 UNU 2015 Annex 3 的 3.0 kg（EU-28 2012）會算出 98.6 kgCO2e，高於環境部 Acer 筆電 81 kgCO2e/台，已不用 |
| 手機 | 0.08 | UNU-KEY 0306，2024 |
| 螢幕／電視 | 8.2 | UNU-KEY 0309 平面螢幕，2024；平面電視 0408 為 14.68，取較輕者 |
| 印表機／事務機 | 12.13 | UNU-KEY 0304，2024 |
| 電腦周邊 | 0.4 | UNU-KEY 0301 Small IT，2024 |
| 塑膠收納與塑膠製品 | 無 | 見 §4.6 |
| 書籍與紙本 | 0.5 | CRA 2020 §6 Books and Magazines |
| 布品與衣物 | 0.25 | CRA 2020 §6 T-shirt（衣物類最輕者） |

報表回傳 `defaultWeightKg`，應揭露預設重量占總重的比例。

UNU 2012 → 2024 換版對預設值的影響：桌機 8.8 → 6.26、手機 0.1 → 0.08（變輕）；螢幕 5.4 → 8.2、印表機 10.0 → 12.13、周邊 0.3 → 0.4（變重，反映大尺寸螢幕與多功能事務機普及）。

### 4.6 其他方法學怎麼處理物品重量，以及塑膠製品的處理

| 方法 | 重量怎麼來 | 出處 |
|---|---|---|
| IVL Second Hand Effect（2013–2022） | 每個刊登分類隨機抽 10–50 則刊登，人工判讀算出「平均產品」的材質比例與塑膠、鋼、鋁重量，套到該分類所有成交 | SHE Report 2020 p.29 |
| eBay × Anthesis（2021） | 每類選一個 representative product，把它的重量、排放與材質套到全類銷售；重量或材質差異大的類別，合併幾個產品成「compound representative product」；重量來自 Ecoinvent、線上零售商網站、WRAP 報告與 Anthesis 估計 | Circular Commerce Methodology Report 2021，Key concepts、Weights 段 |
| Vaayu（Schibsted 2023、Vinted 2023） | 刊登分類對應到 Vaayu 私有 taxonomy 與 Kria 資料庫；對不上就用 proxy 或類別平均排放；重量不公開 | Schibsted SHE 2023 Methodology 段 |
| Charitable Recycling Australia（2020） | 每個品項給平均重量（多取自 FRN 2009），並公開重量讓使用者換成自己的值 | Reuse Impact Calculator Methodology §2、§5、§6 |
| WRAP BOR、EPA WARM | 以公噸計，使用者輸入實際重量，不提供每件預設值 | WRAP 2011；WARM Management Practices §1.3.1 |
| GC贈物網 | 不看重量，件數 × 每件係數 | 研究筆記 §2.6 |

**塑膠製品的建議**：先維持「不給預設、表單必填」，累積資料後改用 IVL 作法以平台自己的樣本訂預設值。理由：
1. 這個類別的重量跨度大（整理籃不到 0.5 kg、大收納箱 2–3 kg、塑膠椅 3–5 kg），單一預設值對大部分物品都不準。eBay 對這種「重量差異大」的類別也是用多個產品合成，而不是一個數字。
2. 找不到像 UNU、CRA 那樣的公開統計；用零售商規格頁合成（eBay 作法）可行，但要自己挑樣本，對外說明時較難辯護。
3. 塑膠製品輕，刊登者用一般秤就量得到；估算值也小（1 kg × 1.95 × 0.5 ≈ 1 kgCO2e），必填不會讓報表少很多。
4. 之後當平台累積 ≥ 30 件有實填重量的塑膠製品（IVL 抽樣下限 10、上限 50），把預設值設為實填重量的第 25 百分位（偏保守），在係數表註明樣本數與截止日，並升 `FACTOR_TABLE_VERSION`。

---

## 5. 驗證：材質法 vs EPD 實測

用每個參考產品自己的材質組成乘環境部係數，對照它的 EPD A1–A3（kgCO2e/kg）：

| 產品 | EPD A1–A3 /kg | 本產品材質法 /kg | 材質法 ÷ EPD | 類別係數 ÷ EPD |
|---|---|---|---|---|
| Steelcase Series 1 | 5.37 | 3.36 | 0.62 | 0.67 |
| Herman Miller Aeron | 2.81 | 6.41 | **2.28** | **1.28** |
| Haworth Soji | 7.47 | 3.68 | 0.49 | 0.48 |
| Kinnarps 6240 | 3.96 | 3.30 | 0.83 | 0.91 |
| Steelcase Personality Plus APAC | 4.32 | 2.96 | 0.68 | 0.83 |
| Steelcase Think APAC（印度） | 6.18 | 3.88 | 0.63 | 0.58 |
| Haworth Aloha Active AP | 5.76 | 3.05 | 0.53 | 0.62 |
| KOKUYO No. 16 | 5.50 | 2.33 | 0.42 | 0.65 |
| Almachair ATLANTA | 5.06 | 2.75 | 0.54 | 0.71 |
| Haworth YourPlace（桌） | 1.60 | 1.98 | **1.23** | 1.00 |
| Bisley Glide（鋼櫃） | 2.84 | 2.47 | 0.87 | 0.87 |
| Bisley Note（活動櫃） | 3.43 | 2.49 | 0.72 | 0.72 |

解讀：
- **材質法通常偏低**（0.42–0.87；2026-11-10 改用 PU、POM、ABS、PVC 實際係數後，辦公椅各款 0.42–0.83），因為環境部係數只到原料出廠，不含成型、組裝、塗裝與廠內能耗。這是預期中的保守偏差。
- **兩個反例**：Aeron 51% 是高再生料壓鑄鋁，套原生鋁錠 9.85 就高估 2.26 倍；YourPlace 的纖維板含 80% 再生料、鋼材 51% 再生料，歐洲材料比台灣 MDF、鋼捲係數低。
- 因此家具類係數取 **min（材質法, EPD 質量加權平均）**。辦公椅 3.594 < 5.092，金屬櫃 2.476 < 3.043，維持材質法；辦公桌 1.980 > 1.604，改用 EPD。辦公椅類別係數只高於 Aeron（1.28 倍，高再生鋁），比九份椅子 EPD 的質量加權平均低 29%。
- **2026-11-09 擴充樣本的影響**：五張新增椅子都是塑膠椅腳，鋁占平均辦公椅重量從 20.6% 降到 11.3%，材質法 4.122 → 3.441；它們在中國、印度製造，電網排放較高，EPD 每公斤 4.32–6.18，加權平均 4.813 → 5.092。兩個方向相反，材質法與 EPD 的差距拉大，表示環境部材質係數（只到原料出廠）對亞洲製造的椅子更保守。
- **2026-11-10 塑膠係數修正的影響**：九張椅子的 BOM 共有 PU 7.5 kg、POM 1.85 kg、ABS 0.56 kg、PVC 0.1 kg 改用實際係數，PU 從 1.95 變成 5.211 是主要變動；材質法 3.441 → 3.594（+4.5%），仍低於 EPD 平均。辦公桌材質法 1.971 → 1.980，仍以 EPD 為準。沙發是固定 BOM（9% PUR 泡棉），沒有 EPD 封頂，1.553 → 1.843（+18.7%）。
- **獨立文獻對照**：沙發本模型 1.843 kgCO2e/kg，CRA 2020 為 166.3 kgCO2e ÷ 37.7 kg = 4.41；書本模型 1.377，CRA 為 1.6 ÷ 0.5 = 3.2；衣物本模型 4.42（纖維級），CRA 一般衣物 13.9 ÷ 0.5 = 27.8。三者都明顯低於 CRA，屬保守端。

---

## 6. 方法學論證

### 6.1 為什麼「二手再使用」可以報避免排放

- **WBCSD *Guidance on Avoided Emissions*（2023-03）**：Gate 2 表 2（p.25）把「Second-hand products → Material efficiency (avoids new manufacturing)」列為對應 IPCC AR6 減緩選項的合格範例；Gate 3（p.26）把 second-hand products 與 car-sharing apps 列為「直接且顯著」貢獻的 end-use solutions。
- **US EPA WARM**：source reduction 的定義包含「Reusing products and materials」與「Extending the useful lifespan of products」（Management Practices §1.1）；電子章明列使用捐贈品屬 source reduction（§1.4.1）。
- **WRAP 2011** 把免費交換網路（Freecycle 類）列為 direct reuse 路徑之一（p.10）。

### 6.2 為什麼只算「避免的新品生產」，而且要乘取代率

骨幹公式和 WRAP、IVL、Vaayu、eBay 一致：避免排放 = 被取代新品的生產排放 × 取代率（研究筆記 §1、§3）。

取代率必要的原因：WBCSD 2023 §5.1 要求「distinguish between the impact of using a solution that replaces activities in the reference scenario, and those that are additional due to the convenience of the solution」。MegaWeaving 的物品是免費的，有人會因為「免費」才拿，並沒有少買一件新品；把每件都當成 1:1 取代會高估。

**R = 0.5 的依據**：
- WRAP 2011 p.10 預設「50% of reuse is displacement of a new item」，另外 50% 取代另一件二手品、不計避免生產（避免重複計算）；作者在 p.11 承認「Currently there is no empirical data to support these assumptions」。
- 實測值範圍：Vinted 2023 為 40%；Schibsted 2023 北歐四站 47–55%（Home 類 39–54%）；WRAP 2025 P2P 轉售 64.6%（研究筆記 §2.1、§2.2、§4）。0.5 落在中間。
- 這些實測都是付費轉售。免費贈送的取代率可能更低，所以 0.5 標記為 `status: "assumed"`，第二版改用自家問卷。

**問卷**（Vaayu 2023、eBay 作法，`replacementRateFromSurvey`）：接手方完成交接時回答「如果沒有拿到這件，你會買全新的同類品嗎？」Yes 計 1、Maybe 計 0.5、No 計 0；同一類別累積有效樣本 ≥ 100 份才取代預設值。

**報表雙欄**：理想值（R=1）對應 IVL SHE 的「potential savings」，估算值（R=0.5）對應 Vaayu 的「avoided emissions」，並列可避免被質疑只挑高值。兩者口徑不完全相同：IVL 的 potential 含避免的處置排放（SHE Report 2020 p.27），本模型不含（§6.4），所以本模型的理想值會比照 IVL 方法算出的值略低，不宜直接比較。

### 6.3 為什麼不計使用階段

接手方用二手品或用新品，使用階段排放相同（家具、紙、布品幾乎為零；電子產品的能耗差異屬於能效比較，不屬於再使用）。Vaayu 2023 與 CRA 2020 §3 都排除使用階段。

### 6.4 為什麼不計處置信用

1. **再使用是延後處置，不是避免處置**。釋出的這件物品最終仍會被丟棄；真正被避免的是「那件沒被買的新品」日後的處置，量是 R × 處置排放，不是 1 × 處置排放。
2. **正負號依材質而變**。WARM v16 Exhibit 1-1 的焚化係數：MDF −0.58、Dimensional Lumber −0.58（生質碳＋能源回收信用），Mixed Plastics +1.26、PP +1.29 MTCO2E/short ton。木製家具若計處置，避免排放反而變少；塑膠則變多。
3. **台灣沒有逐材質處置係數**。環境部資料庫有焚化廠「廢棄物焚化處理服務」（臺南永康 327、城西 333、苗栗 340、岡山 360 kgCO2e/公噸，2017–2020），是混合垃圾每公噸的平均值，不分材質。研究筆記 §9 待確認 #2 的「台灣處置係數」由此找到，但口徑不適合逐材質計算。
4. 量級：用永康 0.327 kgCO2e/kg × R 0.5 × 辦公椅 13.8 kg = 2.26 kgCO2e，只占估算值 24.8 的 9.1%。排除它影響不大，且避免正負號爭議。

### 6.5 為什麼 v1 不扣運輸排放

- PRD §5.1：組織物品不開放 Lalamove，只能面交或自取，平台沒有里程資料。
- WRAP 2011 p.10：direct reuse（含免費交換網路）「assumed to come free of collection burdens, as it is difficult to apportion journeys made, principally by householders」，有先例。
- Internal 與 Members 層的交接大多在同一組織內，往返距離接近零。
- **風險要揭露**：環境部 自用小客車(汽油) 0.115 kgCO2e/延人公里（交通部運研所 2014）。10 公里汽車往返 = 1.15 kgCO2e，占辦公椅估算值的 4.6%，但是一本書估算值（0.34）的 3.3 倍。小物品專程開車取件是淨排放。報表註腳要寫明「未扣除面交往返交通」。
- 之後一般 Share 若用 Lalamove，`server/src/services/lalamove.ts` 已解析報價回傳的 `distance`，可再加 T = 實際里程 × 車種係數。

### 6.6 為什麼台灣材質係數優先，電子產品例外

- 台灣報表讀者（永續辦公室、評鑑）會先問「有沒有用環境部的係數」；環境部資料庫是政府公告、可引用、可再散布，且審查 SOP 明定商品為搖籃到大門。
- 材質法的限制在電子產品最嚴重：WARM Electronics Exhibit 1-8，印刷電路板 126.70、面板模組 54.59 MTCO2E/short ton，塑膠只有 4.76、鐵 2.32。只算外殼材質會漏掉九成以上排放，所以改用 WARM 產品係數。

### 6.7 為什麼用重量而不是件數

- WARM、WRAP 的功能單位都是「每公噸物品」，係數庫也是每公斤。
- 按件數計（GC贈物網作法，研究筆記 §2.6）會讓一張椅子和一個杯子拿到同樣減碳量；PRD 已決定組織物品重量必填。

### 6.8 二手壽命：壽命比 L，預設 like-for-like

WRAP 2011 p.12：WRAP 內部研究顯示「furniture donors keep an item for the same amount of time as furniture recipients anticipate housing the item」，所以假設二手壽命等於新品壽命；DEFRA 2011 的「第二壽命只有一半」列為敏感度（§7）。

- 壽命比是算式裡的獨立一項 L_c（`DEFAULT_LIFETIME_RATIO`），預設值 1 照 WRAP，報表與取代率 R 並列揭露。
- 作法來自 eBay × Anthesis（取代率 × 額外壽命比）與 Privett 2018（RR = LEP × Pb）。
- 上限是 1：二手品再耐用，也只取代一件新品的生產。
- 台灣沒有二手品使用年限的資料。之後可在交接後的問卷問接手者「預計使用多久」，再和新品的平均使用年限相除，按類別替換預設值。

### 6.9 歸屬與重複計算

WBCSD 2023 §5.5.4：避免排放不做價值鏈分攤（「no allocation of avoided GHG emissions should be pursued」），並承認不同主體可能各自宣告。所以組織報表直接計入自己釋出的物品，不扣給接手方。同一組織內部單位間的移轉，在組織層級報表裡只算一次（以 Weave 為單位）。

### 6.10 LLM 的位置

本模型沒有任何數字來自 LLM。LLM 之後只能幫忙「選類別、估重量、追問刊登者」，輸出的是 `CategoryId` 與 `unitWeightKg`，係數一律查 `factorTable.ts`（研究筆記 §7；PCFBench 顯示前沿 LLM 只有 37–58% 的產品落在查證值 2 倍內）。

---

## 7. 敏感度分析（以一張預設重量辦公椅為例，估算值基準 24.80 kgCO2e）

| 變動 | 估算值 kgCO2e | 相對基準 |
|---|---|---|
| R = 0.25（eBay 2023 綜合值，二手來源） | 12.40 | −50% |
| R = 0.40（Vinted 2023） | 19.84 | −20% |
| **R = 0.50（預設）** | **24.80** | — |
| R = 0.646（WRAP 2025 P2P 轉售） | 32.04 | +29% |
| R = 1（理想值） | 49.60 | +100% |
| L = 0.5，二手壽命只有新品一半（DEFRA 2011） | 12.40 | −50% |
| 鋁全部改用再生鋁錠 0.7（椅子 BOM 鋁占 11.3%，係數 3.594 → 2.562） | 17.68 | −29% |
| 計入處置信用（永康焚化 0.327 kgCO2e/kg × R） | 27.06 | +9% |
| 扣 10 km 汽車往返 | 23.65 | −5% |
| PU 改用 2015 年同名記錄 3.17（係數 3.594 → 3.497） | 24.13 | −3% |

其他類別：
- 金屬櫃鋼材改用中鋼冷軋鋼捲 2.94：係數 2.476 → 2.907，仍低於 EPD 平均 3.043。
- 取代率與二手壽命是最大的兩個不確定性，各自可讓結果減半；這也是報表要寫「估算值」並揭露 R 與 L 的原因。

---

## 8. 報表揭露（依 WBCSD 2023 九項報告原則）

報表頁與日後 CSV 註腳建議原文：

> 本數字為「估算避免排放量」：假設接手者若沒有取得這件物品，有 50% 機率會購買同類新品（取代率 R = 0.5，WRAP 2011 預設值，尚未以本平台問卷實測），且二手品與新品的使用年限相同（壽命比 L = 1，WRAP 2011 預設值，尚未實測）。新品生產排放係數來自環境部碳足跡排放係數資料庫（2026-11-08 快照）、US EPA WARM v16（2023-12）與第三方查證的產品環境宣告（EPD），係數表版本 2026-11-10。未計入使用階段、廢棄處置與面交往返交通；小家電與「其他」類別未計入。本數字屬比較性估計，非碳權、非減量額度，不得用於抵減組織溫室氣體盤查或作為碳中和、淨零主張，未經第三方查證。

| WBCSD 原則 | 本模型落點 |
|---|---|
| 1 與盤查、碳匯、碳權分開報告 | 報表獨立頁；措辭明示非碳權 |
| 2 不得用於碳中和／淨零主張 | 措辭明示 |
| 3 揭露解決方案與參考情境 | §3；註腳寫明「同類新品、R = 0.5」 |
| 4 揭露前瞻式或逐年法 | 前瞻式（§3） |
| 5 通過三道資格門 | Gate 2、3 有 WBCSD 原文範例（§6.1）；Gate 1（公司氣候行動可信度）屬組織自身，平台不代為宣告 |
| 6 揭露占營收比例 | 不適用於免費平台；組織自行宣告時須自填 |
| 7 是否第三方查證 | 註腳寫明未查證 |
| 8 負面副作用 | 面交交通未扣除（§6.5） |
| 9 反彈效應 | 未量化；以取代率 < 1 部分反映「因免費而多拿」 |

---

## 9. API 試打紀錄（2026-11-08）

| API | 結果 | 結論 |
|---|---|---|
| 環境部 `GET https://data.moenv.gov.tw/api/v2/cfp_p_02?api_key=<key>&limit=1000&offset=<n>&format=JSON` | 可用。回傳**純陣列**（不是 `{records: []}`），兩頁共 1,188 筆；`format=CSV` 亦可 | 已寫成 `npm run check:emission-factors`，實際執行 9 筆全部一致、exit 0 |
| 同上，data.gov.tw 頁面內嵌的三把示範 key | 第一、三把回 HTTP 200 但內容是純文字「因受限於資源分配，每日呼叫API的次數不可大於5000次。」；第二把可用 | 示範 key 是公用額度，正式使用要自己申請 key 放進 `server/.env.development` 的 `MOENV_API_KEY`；腳本會把非 JSON 回應當錯誤 |
| 環境部 `GET https://data.moenv.gov.tw/api/v2/wr_p_225`（應回收廢電子電器及廢資訊物品回收量） | 可用，58 筆。只有「廢資訊物品類」總量，2016 年以前單位是台、2017 年起是公斤，不分品項 | 無法算出台灣筆電平均重量，不採用 |
| Zenodo `GET https://zenodo.org/api/records/18328494` | 可用，免 key，回傳 UNU 指引第 3 版的檔案清單與下載連結（CC BY 4.0） | 下載 Annex 6 平均重量 CSV 存成快照；模型不在執行時呼叫 |
| EPD International `api.prod.environdec.com/api/v1/EPDLibrary/Files/EPDs/{id}/Documents` | 可用，免登入，直接回 PDF（YourPlace EPD 由此下載） | 只用來下載文件，模型不在執行時呼叫 |
| EPA WARM | 無 API（研究筆記 §2.3），文件 PDF 可下載 | 數值抄入 `factorTable.ts` 與 CSV 摘錄 |
| Lalamove | 未呼叫 | 組織物品 v1 不走 Lalamove；既有程式已解析報價 `distance` 欄位，之後加運輸項時再試打 |

模型執行時**不呼叫任何外部 API**：係數表是版本化的程式碼，API 只用於人工更新與核對。

---

## 10. 限制與待辦

0. **辦公椅缺台灣品牌樣本**（§4.4）：台灣品牌只走 ISO 14067 產品碳足跡，不做 EPD。待決定是否把納入條件 1 放寬為「EPD，或第三方依 ISO 14067 查證的搖籃到大門碳足跡（須同時有重量與材質表）」，並向聯友椅業（Ergohuman）、震旦索取查證聲明。

1. **取代率尚未實測**：要在 Weave 完成流程加一題問卷（§6.2），每類累積 100 份後改用實測值，並把 `FACTOR_TABLE_VERSION` 升版。
2. **環境部係數偏舊**：鋼、鋁、PA6 都是 2013 年公告；鋁用原生值對高再生料產品偏高（§5、§7）。`check:emission-factors` 會在有較新年度時提出警告。
3. **Bisley 兩份 EPD 已過期**（2024-08-28）。數值仍是當時查證的結果，可作封頂參考；之後找到有效的鋼櫃 EPD 應替換。
4. **粒片板以 MDF 代理、實木計 0**：台灣資料庫缺粒片板、合板與鋸材係數。
5. **電子產品預設重量是 UNU 的平均值（2024，不含電池）**：個別產品差異大（13 吋筆電與 17 吋電競筆電差兩倍以上），報表要揭露預設重量占比，表單應鼓勵實填。塑膠製品目前沒有預設值（§4.6）。
6. **小家電不計入**：需要台灣家電產品碳足跡或 EPD 才能補。
7. **未扣面交交通**（§6.5）。
8. 報表頁（#143）要顯示的欄位：理想值、估算值、R 與其狀態、係數表版本、預設重量占比、不計入件數、§8 註腳。已實作：`server/src/services/orgReport.ts`（只算已完成的 Weave，一次 Weave 算一次；`weight_is_default` 的物品以存下的重量計算、揭露時算預設重量），頁面 `/org-admin/report`。

---

## 11. 參考文獻（本模型實際引用的數字）

- 環境部，碳足跡排放係數資料庫（CFP_P_02），<https://data.moenv.gov.tw/dataset/detail/CFP_P_02>，2026-11-08 API 取得；政府資料開放授權條款第 1 版。
- 環境部氣候變遷署，《碳足跡排放係數資料庫審查標準作業流程》第一版，2025-10，<https://dsp.tpex.org.tw/storage/csr/碳足跡排放係數資料庫審查標準作業流程.pdf>（研究筆記 §2.4）。
- US EPA，*Documentation for GHG Emission and Energy Factors Used in WARM v16: Management Practices Chapters*（EPA-530-R-23-018），2023-12，<https://www.epa.gov/system/files/documents/2024-01/warm_management_practices_v16_dec.pdf>；*Electronics* 章，<https://www.epa.gov/system/files/documents/2023-12/warm_electronics_v16_dec.pdf>。
- Fisher K., James K., Maddox P.（ERM / WRAP），*Benefits of Reuse Case Study: Domestic Furniture*，2011，<https://www.wrap.ngo/sites/default/files/2020-09/WRAP-Domestic%20Furniture%20chapter_final.pdf>（p.8 沙發材質、p.10 取代率與收集負擔、p.11 無實證資料、p.12 壽命）。
- WBCSD，*Guidance on Avoided Emissions*，2023-03，<https://www.wbcsd.org/wp-content/uploads/2023/09/Climate-Avoided-Emissions-guidance_WBCSD.pdf>（p.10 九項報告原則、p.25 表 2、p.26 Gate 3、§5.1、§5.3、§5.5.4）。
- Lysaght O., Forti V. et al.，*E-waste Statistics: Guidelines on Classifications, Reporting and Indicators, Third Edition*，UNITAR SCYCLE，2026，CC BY 4.0，<https://zenodo.org/records/18328494>（Annex 6 Table 25 p.163，每台平均重量，不含電池）。舊版對照：Baldé C.P. et al.，同名指引，UNU-IAS，2015，<https://i.unu.edu/media/ias.unu.edu-en/project/2238/E-waste-Guidelines_Partnership_2015.pdf>（Annex 3 p.47）。
- Adevinta，*The Second Hand Effect Report 2020*，<https://www.adevinta.com/wp-content/uploads/2021/09/SHE-REPORT-2020-2.pdf>（p.29 IVL 抽樣法）。
- eBay × Anthesis，*2021 Circular Commerce Methodology Report*，<https://static.ebayinc.com/assets/Uploads/Documents/eBay-2021-Circular-Commerce-Methodology-Report.pdf>（representative product 與重量來源）。
- Schibsted × Vaayu，*The Second Hand Effect Report 2023*，<https://assets.ctfassets.net/9qowtvvo5be7/77HjGUIilek5wIlvIeGkhg/df89f84ef9549d595ca0521a01db97d2/Public_Schibsted-The-Second-Hand-Effect-Report-2023_14-june2024.pdf>（taxonomy 對應與 proxy）。
- Charitable Recycling Australia，*Reuse Impact Calculator Methodology*，2020，<https://www.charitablereuse.org.au/wp-content/uploads/2020/08/Reuse-Impact-Calculator-Methodology.pdf>（§3 邊界、§6 各品項重量與碳足跡）。
- Steelcase Series 1 EPD（NSF EPD10930），<https://info.nsf.org/Certified/Sustain/ProdCert/EPD10930.pdf>
- Herman Miller Aeron Chair Aluminum Base EPD（NSF EPD10431），<https://info.nsf.org/Certified/Sustain/ProdCert/EPD10431.pdf>
- Haworth Soji Task Seating EPD（EPD-IES-0012459:006），<https://www.haworth.com/content/dam/digital/eu/docs/products/haworth/chairs/soji/soji_sustain_epd_eu-en_2025.pdf>
- Kinnarps Task Chair 6000/8000 6240 EPD（NEPD-3617-2541-EN），<https://www.epd-global.com/getfile.php/13223146-1741754522/EPDer/M%C3%B8bler/Sittem%C3%B8bler/NEPD-3617-2541_6000-8000-series---Task-chair-6240-with-wool-fabric-and-plastic-starbase.pdf>
- Steelcase Personality Plus APAC EPD（NSF EPD11108），<https://info.nsf.org/Certified/Sustain/ProdCert/EPD11108.pdf>
- Steelcase Think Americas & APAC EPD（NSF EPD11087），<https://info.nsf.org/Certified/Sustain/ProdCert/EPD11087.pdf>
- Haworth Aloha Active Mesh-Back Task Seating Asia-Pacific EPD（EPD-IES-0013321:003），<https://www.haworth.com/content/dam/digital/ap/docs/products/haworth/seating/aloha-active/sustainability/aloha_active_sustain_epd-ap_en_2024.pdf>
- KOKUYO No. 16 Chair EPD（EPD-IES-0015164:002），<https://www.environdec.com/library/epd15164>
- Almachair Office Chair ATLANTA EPD（EPD-IES-0026478:001），<https://www.environdec.com/library/epd26478>
- Haworth YourPlace Core Rectangular Desk EPD（EPD-IES-0015450:003），<https://www.environdec.com/library/epd15450>
- Bisley Glide Sliding-door Unit EPD（S-P-01613），<https://www.bisley.com/site/assets/files/38292/s-p-01613_epd_bisley_sliding_door_storage_units.pdf>
- Bisley Storage Pedestals EPD（S-P-01616），<https://cdn3.evostore.io/documents/bisley_ireland/s_p_01616_epd_bisley_storage_pedestals_1.pdf>
- 取代率實測值（Vinted 2023、Schibsted 2023、WRAP 2025、eBay）與 WRI 2019 比較排放框架：見研究筆記 §2.1、§2.2、§2.5 的一手連結。
