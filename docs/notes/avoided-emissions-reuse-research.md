# 二手物再使用的「避免排放量」計算模型研究

> **模型實作（2026-11-08）**：依本研究建好的算法、係數來源與方法學論證見 [avoided-emissions-model.md](avoided-emissions-model.md)、ADR 0005。與本文不同處：PP 改用環境部 2023 年新值 1.95（本文 §5 的 2.01 是 2013 年值）；家具係數加上 EPD 封頂；§9 第 2 項找到焚化廠處理服務係數（混合垃圾 327–360 kgCO2e/公噸），但不分材質，模型仍不計處置信用。
>
> **Purpose:** 為 E6-2「估算減碳量（CO2e）」報表（GitHub #136、#143；PRD 0001 §E6-2）盤點國際與台灣既有的二手再使用避免排放計算方法、可引用的排放係數來源、物品材質組成的取得途徑，以及 LLM 在流程中可以／不可以扮演的角色，最後給出 MegaWeaving 的建議方案。
> **Last updated:** 2026-11-08
> **Sources:** 僅採一手來源（官方方法文件、工具試算表、API 文件、論文、原始碼）。只找到二手來源的數字標記 `[secondary]`。所有 PDF 下載於 session scratchpad，未放進 repo；進 repo 的第三方資料有 §2.6 的 GC贈物網類別係數快照（`docs/notes/data/gc-give543-item-categories-carbon-coefficients-2026-11-08.json`），以及建模時加入的環境部 CFP_P_02 全表快照與 WARM v16 Exhibit 1-1 摘錄（見 avoided-emissions-model.md）。

---

## 目錄

1. [結論摘要](#1-結論摘要)
2. [模型逐一說明](#2-模型逐一說明)
   - 2.1 WRAP Benefits of Reuse（UK，2011 → BOR3 2024）
   - 2.2 IVL / Schibsted / Adevinta Second Hand Effect（2013–2022）→ Vaayu（2023）
   - 2.3 US EPA WARM v16
   - 2.4 台灣：環境部碳足跡係數、循環署、地方環保局
   - 2.5 其他：Vinted／eBay／ThredUp、WBCSD、WRI/GHG Protocol、ISO 14067/14044、Zero Waste Scotland
   - 2.6 台灣同類平台：惜物網、愛二手物 i2so5、GC贈物網
3. [模型比較表](#3-模型比較表)
4. [生命週期因子：取代率、壽命延長、處置信用、反彈效應](#4-生命週期因子)
5. [候選係數表（kgCO2e/kg，依 MegaWeaving 類別）](#5-候選係數表)
6. [物品材質組成與重量的取得](#6-物品材質組成與重量的取得)
7. [LLM 的可為與不可為](#7-llm-的可為與不可為)
8. [MegaWeaving 建議方案](#8-megaweaving-建議方案)
9. [尚未確認 / Open questions](#9-尚未確認--open-questions)

---

## 1. 結論摘要

- 國際上所有被引用的二手再使用減碳模型，骨幹公式都一樣：**避免排放 = 被取代新品的生產排放（cradle-to-gate 或 cradle-to-consumer）× 取代率 − 再使用流程本身的排放（運輸、整修、平台營運）**，部分再加上「避免的廢棄處置排放」。差異只在取代率怎麼來、是否計入處置、係數庫是哪一套。
- **取代率是最敏感的變數**。早期模型（IVL 2013–2022、WRAP 2011 預設）用 1:1 或固定 50%；2023 年後的主流（Vaayu for Schibsted/Vinted、eBay/Anthesis、WRAP 2025）改用使用者問卷實測，典型值 40%–65%。WRAP 自己承認「目前沒有實證資料支持這些（取代率）假設」（WRAP 2011 p.11）。
- **台灣同類平台都沒有公開方法**（§2.6）：惜物網、愛二手物 i2so5 只有口號；GC贈物網用「件數 × 類別係數（gCO2e／件）」計算，完全不看重量；係數沒有出處，還有明顯異常值（公開 API 可抓）。2025-09 以前的企業案例數字則吻合「每公斤垃圾 2.06 kgCO2」。MegaWeaving 若公開公式、係數出處與取代率，會是國內同類平台第一個。
- **台灣沒有官方的「二手再使用減碳係數」**。環境部碳足跡排放係數資料庫（CFP_P_02，1,188 筆）提供的是**原物料 cradle-to-gate 係數**（PP 2.01、冷軋鋼捲 2.94、中密度纖維板 1.12、聚酯棉 4.17 kgCO2e/kg 等），可作為「被取代新品生產排放」的材料級係數；但沒有成品家具、辦公椅、電腦（除一筆 Acer 筆電 81 kgCO2e/台）的係數。
- **US EPA WARM v16** 有可直接引用的 source reduction 係數（木材 −2.11、MDF −2.41、混合塑膠 −1.87、鋼罐 −3.03、混合電子 −20.79 MTCO2E/short ton），單位需換算（÷0.907 → kgCO2e/kg），且 WARM 明確把「reuse」視為 source reduction 的一種。WARM 沒有紡織品、也沒有成品家具。
- **建議**：採 WRAP/IVL 骨架 + 問卷取代率的「保守值」，係數優先引用環境部 CFP_P_02（台灣可引用、政府開放授權），缺口補 WARM v16；報表同時顯示「潛在值（1:1）」與「估算值（含取代率）」，措辭為「估算避免排放量，非碳權、非減量額度、不得用於抵減組織盤查」，遵循 WBCSD 2023 九項報告原則。
- **LLM 的正確位置**：從貼文標題／描述／照片分類到類別、估重量與材質比例並給信心分數、向刊登者追問；**不得**讓 LLM 產生或「記憶」排放係數，係數必須來自版本化的係數表。

---

## 2. 模型逐一說明

### 2.1 WRAP「Benefits of Reuse」（UK）

**來源**：Fisher K., James K., Maddox P.（ERM / WRAP），*Benefits of Reuse Case Study: Domestic Furniture*，2011-11-01。PDF：<https://www.wrap.ngo/sites/default/files/2020-09/WRAP-Domestic%20Furniture%20chapter_final.pdf>（頁面：<https://www.wrap.ngo/resources/case-study/benefits-re-use-case-study-domestic-furniture>）。方法論總綱為 James K. (2011) *A methodology for quantifying the environmental and economic impacts of reuse*，工具頁 <https://www.wrap.ngo/resources/tool/environmental-and-economic-benefits-re-use>。

**邊界與公式**（p.9–12）：以「每公噸物品」為功能單位，比較 direct reuse（慈善商店、免費/付費交換如 eBay、Freecycle）、preparation for reuse（家具再使用網絡收集＋整修）、landfill、recycling 等路徑。每條路徑計算：收集運輸 + 場站營運/整修 + 最終處置 − 取代新品的「避免生產」（displacement）。
- 預設**取代率**：「50% 的再使用取代新品；50% 取代另一件二手品（不計避免生產，避免重複計算）」；另假設 10% 售出品需整修（沙發換布套）（p.10）。
- 沙發的「被取代新品」材質組成假設：粒片板 63%、PUR 泡棉 9%、棉織布 8%、軟木 8%、低合金鋼 8%、聚酯 3%、磷系阻燃劑 1%、美耐皿 1%（p.9）；餐桌假設 100% 木材（p.24）。
- 係數來源：Defra product lifetimes study（沙發）、ecoinvent v2.0（餐桌）、Defra/DECC 2011 轉換係數（參考文獻頁）。
- **結果**：沙發 direct reuse −1.45 tCO2e/t（約 54–55 kgCO2e/件）、prep-for-reuse −1.05；餐桌 direct reuse 反而 **+0.38 tCO2e/t**、prep-for-reuse +0.76（因為木桌生產排放低、收集/整修排放相對高），但仍低於掩埋（≈1 tCO2e/t）（p.3、p.24）。
- **敏感度**：若採 DEFRA (2011) 的「第二次壽命只有第一次的一半」，沙發 −1.45 → −0.42、−1.05 → −0.04（p.15）。作者明言「目前沒有實證資料支持取代率假設」（p.11）。

**BOR3（2024 年更新）**：Excel 工具 `BOR3_v1.xlsm`（免費下載、WRAP 條款）、User Guide 與 *Climate Impacts Summary*（<https://www.wrap.ngo/resources/tool/benefits-of-reuse-tool>，頁面日期 2024-07-03）。Climate Impacts Summary Table 6（家具，kgCO2e/t）：direct re-use 預設 −679（其中 displacement −817、disposal −130、collection +217、site operation +50）、charity shop −740、exchange for money −615、prep-for-reuse −255、100% landfill +716、business-as-usual −223。衣物 direct re-use −10,140、家電 −2,208。報告自述「Benefits of Re-use tool 對取代率高度敏感」（p.9）。

**WRAP 2025 取代率實測**：*Displacement Rates Untangled*（2025-02）：P2P 轉售取代率 64.6%（7,061 份問卷，Vestiaire/eBay/Depop）、修補 82.2%（721 份）。新聞稿：<https://www.wrap.ngo/media-centre/press-releases/fast-fashion-could-be-left-peg-preloved-and-repair-displace-new-sales>。

### 2.2 IVL / Schibsted / Adevinta「Second Hand Effect」→ Vaayu

**IVL 版（2013–2022）**：方法由 IVL Swedish Environmental Research Institute 與 Ethos International 共同開發；沒有獨立的 IVL 方法報告 PDF，方法載於各年 SHE 報告的 Methodology 章。引用 *Second Hand Effect Report 2020* pp.27–30：<https://www.adevinta.com/wp-content/uploads/2021/09/SHE-REPORT-2020-2.pdf>。
- 兩項假設：「每買一件二手品就不需買對應新品，新品生產的材料與排放被避免」；「二手品被再使用而非丟棄，處置排放被避免」（p.27）→ **1:1 取代 + 處置信用**。
- 材質組成：IVL 對每個分類**隨機抽樣 10–50 則刊登**，人工分析得出平均材質比例（material partition），再用 ecoinvent 等 LCA 資料庫算出原料開採、製造、廢棄處理的排放（p.29）。只追蹤塑膠、鋼、鋁三種材料量。
- 扣除：買賣雙方運輸（問卷測距）、資料中心、辦公室用電、差旅（p.29）。
- 排除：使用階段、材料全生命週期、再生料（p.30）。汽車另乘以「reuse rate」（平均轉售次數）。
- 用字：一律稱 **potential savings**，「採保守方法，低估節省、高估自身排放」（p.30）。2022 報告（<https://adevinta.com/wp-content/uploads/2024/02/SHE-REPORT-2022.pdf>）Q&A 承認未納入 rebound effect。

**Vaayu 版（Schibsted SHE 2023，2024-06 發布）**：<https://assets.ctfassets.net/9qowtvvo5be7/77HjGUIilek5wIlvIeGkhg/df89f84ef9549d595ca0521a01db97d2/Public_Schibsted-The-Second-Hand-Effect-Report-2023_14-june2024.pdf>（p.9–12）。
- 改用 **consequential LCA**，遵循 WRI 2019 比較排放指引；避免排放 = 新品 cradle-to-consumer 排放 × Replacement Rate − 配送/包裝/營運排放。使用與廢棄階段排除（兩情境相同，互相抵銷）。
- **Replacement Rate** 問卷題：「如果你沒在二手平台找到這件商品，你會買這件或類似的全新品嗎？」Yes 算 100%、Maybe 算 50%、排除專業轉售者與「隨便逛到」的非計畫性購買；每市場每類別至少 100 份有效樣本（n≈2,800）。
- 結果：FINN 54%、Tori 47%、DBA 55%、Blocket 50%；Home 類 54%／39%／49%；Electronics 54%／53%／61%（各站 Results 頁）。
- 排除類別：古董/收藏/藝術品、車輛、寵物、票券、服務、職缺。無對應分類時用代理值或類別平均。

### 2.3 US EPA WARM（Waste Reduction Model）v16

**來源**：WARM Version 16，2023-12；*Management Practices* 章（Source Reduction 第 1 章）：<https://19january2025snapshot.epa.gov/system/files/documents/2024-01/warm_management_practices_v16_dec.pdf>；*Construction Materials* 章（地毯、木製品）：<https://www.epa.gov/system/files/documents/2023-12/warm_construction_materials_v16_dec.pdf>；版本頁：<https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model>。

- **定義**：source reduction 包含「再使用產品與材料」與「延長產品使用壽命」（§1.1）。效益三來源：避免上游原料取得/製造/運輸排放、增加森林碳儲存（紙/木）、避免下游廢棄處理排放（§1.2）。
- **基準**：預設「current mix」（全國平均原生/再生料比例），可選「100% virgin」作為上限（§1.2）。
- **再使用公式**（§1.3.1）：`GHG Benefits of Reuse = (N − 1) × A`，A = source reduction 情境與原處置情境的差，N = 總使用次數。範例：1,000 short ton HDPE 箱，100% virgin 基準 760 MTCO2E、current mix 661 MTCO2E。
- **單位**：MTCO2E / short ton（1 short ton = 907.185 kg）；負值 = 減量。**換算 kgCO2e/kg = 值 ÷ 0.907**。
- **格式**：Excel `warm_v16.xls` 與 openLCA 資料庫；**無網頁版、無 API**（版本頁）。
- **沒有紡織、沒有成品家具**：Wood Products 章說明 MDF「主要用於製造家具」、dimensional lumber 含家具用途（§12 p.5550–5554）；背景文件提到 EPA「正在評估紡織品 LCA 資料」（warm-background v16 §Textiles）。
- **內部不一致**：Exhibit 1-1 列 MDF source reduction −2.41，Exhibit 12-3 列 −3.05（同版本）；引用時需註明取哪一個。

### 2.4 台灣

**環境部碳足跡排放係數資料庫（CFP_P_02）**
- 資料集頁：<https://data.moenv.gov.tw/dataset/detail/CFP_P_02>；data.gov.tw 鏡像 <https://data.gov.tw/dataset/28176>；來源網站 <https://cfp.moenv.gov.tw/>（舊網址 cfp-calculate.tw，係數資料庫需會員登入才能逐筆查詢）。
- API：`https://data.moenv.gov.tw/api/v2/cfp_p_02?api_key=<key>&limit=1000&offset=<n>&format=JSON`（CSV/XML 亦可）；需申請 API key（data.gov.tw 資料集頁內嵌有公開示範 key）。2026-11-08 抓取共 **1,188 筆**。
- 欄位：`name`（係數名稱）、`coe`（kgCO2e）、`unit`（宣告單位，多為公斤）、`departmentname`、`announcementyear`、`Scpoe3_iso`、`Scpoe3_ghg`。**沒有系統邊界欄位**。
- 系統邊界依《碳足跡排放係數資料庫審查標準作業流程》第一版（環境部氣候變遷署，2025-10）：「商品：系統界限應為搖籃到大門（Cradle-to-Gate）；服務：搖籃到墳墓」，且「資料庫所列係數屬二級數據」、「應優先引用年份較新之係數」（<https://dsp.tpex.org.tw/storage/csr/碳足跡排放係數資料庫審查標準作業流程.pdf>）。
- 授權：政府資料開放授權條款第 1 版（<https://data.gov.tw/license>）。
- 內容特性：大量**原物料**係數（塑膠粒、鋼捲、紙漿、紙板、纖維、玻璃），少數成品（Acer 11.6 吋筆電 81 kgCO2e/台、不鏽鋼置物架 3.3–10.3 kgCO2e/kg）。許多係數公告年份 2013–2016，偏舊。

**環境部／循環署再使用減碳**
- 《資源循環減碳旗艦行動計畫（核定本）》環境部 2025-10（<https://www.ey.gov.tw/File/A6EE96C8CF228632?A=C>）：減碳計算方式為「循環設施營運量 × 碳足跡排放係數」；塑膠以「1 噸再生料 = 減少 1 噸原生料，減少 2 公噸 CO2e（歐盟 2018 係數）」；提到延長使用壽命，但**沒有二手商品逐類別的再使用係數**。
- 環境部新聞「大家一起來顧碳－請多使用再生傢俱」：15 縣市每年修復再生家具 4,500 公噸，「如直接焚化將產生 7,650 公噸 CO2」（≈1.7 kgCO2/kg 家具，焚化口徑），「等同將 2,086 公噸碳顧在家中」（<https://enews.moenv.gov.tw/Page/3B3C62C78849F32F/12e63f29-af97-412a-9ff3-77f78893a677>，本次抓取 403，數字取自搜尋摘要 `[secondary]`）。
- 「每減少 1 公斤垃圾約減少 2.06 公斤 CO2」：台北市工程環評附錄與臺中市低碳網皆引自環境部「清淨家園顧厝邊綠色生活資訊網／臺灣碳足跡資訊網」（<https://lowcarbon.taichung.gov.tw/page/about/index.aspx?kind=47&lang=TW>）`[secondary]`；原始推導頁未找到，不建議作為報表主係數。
- 衣物：臺北市／新北市環保局「每回收 1 件衣服約減少 4.2 公斤碳排」`[secondary]`；循環署「5 萬件循環衣估減 1.7 萬公斤舊衣、21 萬公斤碳排」（纖維再製，非再使用）`[secondary]`。
- **法規提醒**：碳足跡標籤相關規範對誇大減碳有罰則（新聞報導稱 NT$1 萬–100 萬 `[secondary]`）；平台報表不是碳標籤，但措辭仍應避免「減碳量」被誤讀為查證過的減量。

### 2.5 其他模型與規範

| 名稱 | 性質 | 重點 | 來源 |
|---|---|---|---|
| **Vinted × Vaayu Climate Change Impact Report 2023** | 企業委託、第三方（Vaayu）計算，非同儕審查 | consequential LCA；Replacement Rate 40%（2023 年 94,000 名會員問卷，累計 350,000）；平均每件避免 1.25 kgCO2e（cradle-to-consumer，排除使用與廢棄）；西裝外套 2.44、牛仔褲 2.00、T 恤 0.45 kgCO2e/件 | <https://press-center-static.vinted.com/Vaayu_x_Vinted_Full_Climate_Impact_Report_2023_9a4b6352d1.pdf> pp.9–12, §6.2 |
| **eBay × Anthesis Recommerce methodology（2022 開源）** | 企業方法文件 | 取代率 = 新品取代率 × 額外壽命比；問卷 yes=1、don't know=0.5；輸出 kgCO2e/item、避免掩埋/焚化 kg | <https://static.ebayinc.com/assets/Uploads/Documents/eBay-2021-Circular-Commerce-Methodology-Report.pdf>；2023 Impact Report 綜合取代率約 25% `[secondary]` |
| **ThredUp × Green Story LCA（2022）** | 企業委託 LCA，稱依 ISO 14040 | 15 類服飾；取代率 ≥16% 轉售才有淨效益；平均減 25% | <https://cf-assets-tup.thredup.com/about/pwa/LCAReport-ResaleTextiles-ThredUP-101022.pdf> |
| **WBCSD Guidance on Avoided Emissions v1（2023-03）／v2（2025）** | 跨產業指引（G7 公報背書），非 ISO 標準 | 定義：解決方案 vs 參考情境的「正向」差額；三道資格門（公司氣候行動可信度／科學一致／貢獻正當性）；**「Second-hand products → Material efficiency (avoids new manufacturing)」明列為 Gate 2 合格範例**（p.~1479）；九項報告原則：與盤查分開報告、不得用於碳中和/淨零主張、揭露參考情境、揭露占營收比例、是否第三方查證、揭露負面副作用 | <https://www.wbcsd.org/wp-content/uploads/2023/09/Climate-Avoided-Emissions-guidance_WBCSD.pdf>；v2 鏡像 <https://cecodes.org.co/wp-content/uploads/2025/10/Guidance-on-Avoided-Emissions.pdf> |
| **WRI / GHG Protocol *Estimating and Reporting the Comparative Emissions Impacts of Products*（2019 working paper）** | 智庫工作報告（Vaayu 方法所依循） | 比較排放 = 產品存在 vs 不存在的生命週期差；GHG Protocol Scope 3 立場：避免排放須與 Scope 1–3 分開、不得抵減 | <https://ghgprotocol.org/sites/default/files/standards/18_WP_Comparative-Emissions_final.pdf> |
| **ISO 14067:2018 / ISO 14044:2006** | 國際標準 | 14067 只處理產品碳足跡單一指標，溝通依 14021/14025/14026；14044 規定「對外公開的比較性主張」須由利害關係人小組做 critical review | 標準本文付費；條文摘要 `[secondary]` |
| **Zero Waste Scotland Carbon Metric** | 政府廢棄物統計 | 2011 指引中家具權重為 0.00；報告自述「再使用與修補活動大多未被 Carbon Metric 捕捉」；HWRC 再使用工具包：「目前沒有蘇格蘭模型，Reuse Network 提供計算器」，且提醒再使用減碳應歸於**購買二手品者**而非地方政府 | <https://www.gov.scot/binaries/content/documents/govscot/publications/advice-and-guidance/2011/03/scotlands-zero-waste-plan-carbon-metric-guidance/documents/0114810-pdf/0114810-pdf/govscot:document/0114810.pdf>；<https://www.zerowastescotland.org.uk/hwrcdata> |
| **Charitable Reuse Australia Reuse Impact Calculator（2020）** | NGO 彙整，自述「僅彙整既有研究，非原創 LCA」 | 每件：軟墊家具 166.3 kgCO2（假設 37.7 kg/件 → ≈4.4 kgCO2/kg）、小家具 22.4、大家具 83.4、小家電 167.7（8 kg/件）、書 1.6（0.5 kg）；來源含 WRAP/James 2011、AERESS、González-García 2011 | <https://www.charitablereuse.org.au/wp-content/uploads/2020/08/Reuse-Impact-Calculator-Methodology.pdf> |
| **Mistra Sustainable Consumption Report 1:4（Carlsson Kanyama et al. 2019）** | 學術（KTH），EAP 混合 LCA/IO | 218 項消費品 kgCO2e/kg 與 /SEK；家具類 kgCO2e/kg：沙發 1.38、椅子 2.27、床 3.69、衣櫥/抽屉櫃/書櫃 0.286、庭園家具 7.47、地毯 14.5、資訊處理設備 77.3 | <https://www.sustainableconsumption.se/wp-content/uploads/sites/34/2020/09/EAP-rapport.pdf>；數值轉引自 DiVA 論文 Table 14（<https://www.diva-portal.org/smash/get/diva2:1680868/FULLTEXT01.pdf> p.60） |

### 2.6 台灣同類平台（2026-11-08 查核）

| 平台 | 是否公告換算方式 | 查到的內容 |
|---|---|---|
| **惜物網**（臺北市動產質借處，<https://shwoo.gov.taipei/>） | **否** | 性質是報廢公產拍賣，非民間交換。首頁、FAQ、網站導覽皆無減碳數字或係數，只有「3R、循環經濟」用語；對外成果只有件數與成交金額（例：臺中市 108–114 年 53,019 件、1.84 億元，<https://www.taichung.gov.tw/8868/8872/9962/3216496>）。 |
| **愛二手物 i2so5**（前環保署，2014 啟用） | **否** | 啟用新聞稿只說「節能減碳」，無公式（<https://enews.moenv.gov.tw/page/3b3c62c78849f32f/e56d44e4-1ea0-4587-838f-db53ef3659e1>）。唯一相關數字是 §2.4 再生家具新聞稿的 ≈1.7 kgCO2/kg（焚化口徑，非 i2so5 係數）。 |
| **GC贈物網**（吉星共享，<https://www.give-circle.com/>） | **否（無方法文件）**，但系統內有係數表 | 見下 |

**GC贈物網細節**
- **公開說法**：媒體只報累計值（截至 2025-12 累計減碳 11,397 公噸，<https://www.ctee.com.tw/news/20251222701568-431204>；企業案例中石化 480 kg → 988.8 kgCO2、遠東 SOGO 2,890.7 kg，<https://canopi.tw/circular-economy/give-circle/>），提到「減碳係數與永續數據模型」與「可稽核」，但未說明公式、單位、係數出處或查證單位。付費 SaaS「GC減碳帳戶」（年訂閱，核發「減碳證書」）的前端 FAQ 也未說明算法（`m.give-circle.com` JS chunk `43`、`98`）。
- **系統實際結構**：公開、免登入的 `GET https://api.give543.com/api/item-categories` 回傳 212 個類別，每類有 `carbon_coefficient`、`new_value`、`used_value`（後兩者看似新品／二手估價，新台幣）。椅子、桌子、層架、收納、玩具、鍋具、餐具另有第三層**材質子類別**（例：椅子 木質 2142.40／塑膠 2869.10／金屬 7202.13）。快照：`docs/notes/data/gc-give543-item-categories-carbon-coefficients-2026-11-08.json`。
- **實際公式（2026-11-08 以公開 API 驗證）**：

  ```
  carbon_reduction (kgCO2e) = Σ 件數 quantity × carbon_coefficient (gCO2e／件) ÷ 1000
  ```

  - 單位是 **gCO2e／件，不是每公斤**。驗證：聚陽實業只贈出 1 件「其他」，`carbon_reduction` = 2.14、`give_material_value` = 635，剛好等於「其他」的 2142.40 g 與 `new_value` 635；大溪國際青年商會 carbon ÷（贈出＋公益捐贈）= 2.142。
  - **不看重量**：刊登表單（前端 `gift/NewGift.vue`）欄位只有 `title`、`category_id`、`item_category_id`（「物品材質」）、`valuation`、`is_new`、`quantity`、`desc`，沒有重量。
- **係數表的問題**：
  1. 有不合理的值：電鍋／料理鍋 3,600,000 g（= 3,600 kg／件）、電風扇 458 kg、燈具 430 kg。
  2. 大量類別直接套 2142.40 預設：電腦、手機、沙發、床架、大型家電、電視等，實際上沒有依品類區分。
  3. 無出處欄位、無取代率，看不出是否 1:1。
- **兩階段算法 `[推論]`**：類別表 `created_at` 為 2025-09-04。較早的中石化案例 988.8 ÷ 480 = **2.06** kgCO2/kg，正好等於 §2.4「每減少 1 公斤垃圾約減少 2.06 公斤 CO2」，所以 2025-09 以前大概是「總重 × 垃圾減量係數」，之後才改成「件數 × 類別係數」。
- **2142.40 的來源 `[推論]`**：2142.40 g ＝ 2.06 kgCO2/kg × **1.04 kg**，小數完全吻合。看起來是「每件假設 1.04 kg × 垃圾減量係數 2.06」的預設值，1.04 kg 的出處不明。212 類中有 97 類用這個值，多半是「其他」與一般子類別。其中 31 筆沒有 `new_value`／`used_value`、`version` = 1，沒有個別估算過；也有 14 筆 `new_value` = 635、`version` = 3 的類別仍是 2142.40，表示改版時只動了價值欄、沒有動係數。

**GC 公開 API 端點目錄**（base `https://api.give543.com/api`；從前端 bundle `m.give-circle.com/static/js/46.*.js` 抽出 154 個路徑，下表只列跟本研究相關的）

| 端點 | 是否呼叫 | 回傳／用途 |
|---|---|---|
| `GET /item-categories` | 是，免登入 | 212 個類別：`id`、`title`、`parent_id`、`level`（1–3，第 3 層是材質）、`carbon_coefficient`（g/件）、`new_value`、`used_value`（NTD）、`version`、`created_at`、`updated_at`。快照：`data/gc-give543-item-categories-carbon-coefficients-2026-11-08.json` |
| `GET /carbonLabelling?keyword=&page=&perPage=` | 是，免登入 | 企業／組織減碳帳戶列表（總共 11 筆）：`id`、`name`、`short_name`、`limit`（人數上限）、`parent`、`type`、`status`、`employee_no_required`、`infos`、`pics`、`created_at`，以及**邀請碼與管理者 user id（本研究不保存）** |
| `GET /carbonLabelling/{id}` | 是，免登入 | 企業層級彙總：`give_quantity`、`request_quantity`、`commonweal_donate_quantity`、`carbon_reduction`（kgCO2e）、`give_material_value`（NTD）、`give_cities[]`（縣市 × 件數）、`commonweal_beneficiary_count`、`member_beneficiary_count`、`active_group_count`、`last_week_better_than_percent`、`last_week_period`，以及 `thanks[]`（受贈留言）、`commonweals[]`（受益社福帳號）。快照只存企業層級數字：`data/gc-give543-carbon-accounts-aggregates-2026-11-08.json` |
| `GET /carbonLabelling/{id}/users?page=&perPage=` | **未呼叫**（第三方個人資料） | 前端 `getCarbonLabellingUsers`：群組成員列表 |
| `GET /carbon_labelling_group_users/{id}/influence?start_date=&end_date=` | **未呼叫**（個人資料） | 前端 `getMyCarbonLabellingInfluence`：個人在團隊期間的減碳量，以及換算的 `carbonData.electricity`（度）、`plasticBags`（個）、`trees`（棵/年）。換算係數在後端，前端看不到 |
| `GET /carbonLabelling/getInfoByCode?code=` | 未呼叫 | 用邀請碼查企業群組 |
| `POST /carbonLabelling/bind` | 未呼叫（寫入） | `{code, employee_no}`，用邀請碼加入群組 |
| `GET /page/configs/carbon_account_agreement` | 是，免登入 | 減碳帳戶使用者條款全文：「減碳證書之減碳數據計算結果不等同碳足跡數據」；第 5 條禁止逆向工程與未經授權的串接 |
| `GET /page/configs/about543` | 是，免登入 | 企業服務介紹（四項，見下） |
| `GET /gifts/home` | 是，免登入 | 熱門贈物 20 筆：`id`、`title`、`desc`、`quantity`、`city`、`district`、`status`、`user`……，**沒有減碳欄位，也沒有重量欄位** |
| `GET /search?type=gift&...` | 是 | 參數空值時回 400（Elasticsearch parsing_exception） |
| `GET /festival/earth-day`、`GET /config/info` | 是 | 活動設定，跟本研究無關 |

**企業減碳帳戶彙總（2026-11-08，原值）**

| id | 企業／組織 | 贈出 | 索取 | 公益捐贈 | carbon_reduction (kg) | 物資價值 (NTD) | kg／贈出件 |
|---|---|---|---|---|---|---|---|
| 1 | ABC公司（示範帳號） | 414 | 16 | 432 | 3,030.74 | 2,242,646 | 7.32 |
| 3 | 大溪國際青年商會 | 565 | 219 | 109 | 1,443.98 | 1,314,125 | 2.56 |
| 44 | 凱基銀行 | 1,918 | 246 | 813 | 18,859.60 | 5,989,711 | 9.83 |
| 50 | 錼創顯示科技 | 15 | 19 | 0 | 46.57 | 49,789 | 3.10 |
| 57 | 聚陽實業 | 1 | 0 | 0 | 2.14 | 635 | 2.14 |
| 51–56 | 萬箖、力誠實業、Avery、台灣百和工業、逸祥國際、聚益實業 | 0 | 0 | 0 | 0 | 0 | — |

**企業服務**（`/page/configs/about543`）：①企業內部共享圈 App；②「分享減碳行動」：教育訓練＋代客贈送；③ESG／SDGs／永續報告的影響力數據建模；④客製化公益專案（心願認養、志工）。前端另有品牌好物（`brandGifts`）、愛心箱（`love/companies`）、企業福利綁定（`welfare/enterprises`）、聯合團隊每週排名（`unitedGroups`）。

**GC 減碳帳戶**（前端 `carbonAccount/*` chunk）：年度訂閱，方案頁寫「每月只要 1900 元」，可免費試用 30 天，綁信用卡自動續訂。功能有：GC 永續標章、企業成果頁、月度永續報表（減碳總覽、每月分布、物品類別、循環足跡地圖、受益對象）、月度減碳證書（加蓋浮水印，申請時要勾用途：官網、永續報告書、商業提案、社群、比賽），以及訂閱期間的商標與數據引用授權（退訂後失效）。**不能兌換任何東西**：減碳量沒有點數化，也不能交易。平台上另有「蘿蔔點數」錢包（付運費用），環境部「環保集點」綠點可以換成蘿蔔點數，但兩者都跟減碳帳戶無關。
- **對 MegaWeaving 的意義**：結構（類別＋材質子類別查表）與 #136 規劃相同，可作為類別切分的參考；**係數本身不可引用**。

**同儕審查／標準化 vs 企業行銷**：ISO 14040/44/67、WRI 2019、WBCSD 2023 是規範層；WRAP、EPA WARM、Mistra 是政府/學術方法（有公開 Excel 或附錄）；Second Hand Effect、Vinted、eBay、ThredUp 是企業報告，方法由顧問（IVL、Vaayu、Anthesis、Green Story）設計，資料與係數庫（如 Vaayu Kria）不公開，應視為「可參考方法結構，不可直接引用其數字」。

---

## 3. 模型比較表

| 模型 | 邊界 | 公式骨架 | 取代率 | 處置信用 | 係數來源 | 開放性 | 適合 MegaWeaving？ |
|---|---|---|---|---|---|---|---|
| WRAP 2011 / BOR3 2024 | 每公噸；收集＋場站＋處置－避免生產 | 路徑比較（reuse vs landfill 等） | 預設 50% 新／50% 舊；2025 實測轉售 64.6% | 有（含掩埋/焚化） | Defra、ecoinvent v2 | Excel 免費、方法公開 | **骨架可採**；係數偏英國 |
| IVL SHE 2013–2022 | 原料＋製造＋廢棄－平台運輸/營運 | 1:1 取代 + 避免處置 | 1.0（稱 potential） | 有 | ecoinvent | 方法摘要公開、係數不公開 | 材質抽樣法可學；1:1 不建議 |
| Vaayu（SHE 2023、Vinted） | cradle-to-consumer；排除使用/EOL | 新品排放 × RR − 配送/包裝/營運 | 問卷 40–55% | 無 | Vaayu Kria（私有） | 不公開 | 問卷設計可照抄；係數不可用 |
| EPA WARM v16 | 上游＋森林碳＋避免處置（相對基準） | source reduction − 原處置；(N−1)×A | 隱含 1.0（使用者自行調整） | 有（基準情境） | EPA 自建 LCI | Excel/openLCA 公開、公有領域 | **缺口係數來源**；單位需換算；無紡織/成品家具 |
| 環境部 CFP_P_02 | 商品 cradle-to-gate | （只是係數庫，非模型） | — | 無 | 環境部審查之二級數據 | 政府開放授權、API | **台灣可引用的首選材料係數** |
| eBay/Anthesis | 新品生產 | 新品排放 × 取代率 × 額外壽命 | 問卷 ×0.5 ≈25% | 有（掩埋/焚化 kg） | 公開文獻 | 方法 PDF 公開 | 「額外壽命」因子值得借用 |
| WBCSD 2023 | 規範層 | 解決方案 vs 參考情境 | 須揭露參考情境 | — | — | 公開 | **措辭與報告原則依此** |

---

## 4. 生命週期因子

**取代率（displacement / replacement / substitution rate）**
- 1:1：IVL SHE（稱 potential savings）、WARM 預設、ThredUp 2019 舊版。
- 固定假設：WRAP 2011 預設 50%（且另 50% 不計任何效益）。
- 問卷實測：Vinted 40%（2023）；Schibsted 北歐 47–55%（Home 類 39–54%）；WRAP 2025 轉售 64.6%、修補 82.2%；eBay yes=1/don't know=0.5。
- 問卷題型共識：「如果沒有找到這件二手品，你會買全新的同類品嗎？」Yes/Maybe/No，Maybe 計 0.5，排除專業轉售者。

**壽命延長（lifetime extension）**
- WRAP 2011 預設二手壽命 = 新品壽命（like-for-like），敏感度分析用 DEFRA 2011 的 1/2（沙發效益從 −1.45 掉到 −0.42 tCO2e/t）。
- eBay：取代率 × 額外壽命比。DiVA 論文引用 Privett (2018)：RR = LEP × Pb（壽命延長比例 × 取代機率），並指出二手家具耐久性資料「高度缺乏」。

**處置信用**：WRAP、IVL、WARM、eBay 計入；Vaayu 不計（主張兩情境的使用與廢棄相同而抵銷）。對 MegaWeaving 而言，台灣廢家具主要焚化（環境部新聞以焚化口徑估 1.7 kgCO2/kg），若計入需用焚化係數而非掩埋。

**反彈效應（rebound）**：所有模型都承認未納入（SHE 2022 Q&A、eBay refurbished methodology「取代率越低反彈越大」）。WBCSD 要求揭露，不要求量化。

**平台自身排放**：IVL/Vaayu 扣除運輸、資料中心、辦公室；WRAP 計收集與場站。MegaWeaving 有 Lalamove 配送紀錄，可用實際里程 × 車種係數扣除（環境部有運輸服務係數）。

---

## 5. 候選係數表

單位 kgCO2e/kg（被取代新品的生產排放，cradle-to-gate 除另註）。WARM 值為 Exhibit 1-1 source reduction（current mix）÷ 0.907。MegaWeaving 類別為 PRD 所述「約 10 類企業常見品項＋其他」的草案，可再調。

| MegaWeaving 類別 | 預設材質組成（待驗證） | 環境部 CFP_P_02（公告年） | EPA WARM v16 | 其他參考 | 缺口 |
|---|---|---|---|---|---|
| 木質辦公桌／會議桌／書櫃 | MDF/粒片板 80%、鋼 15%、塑膠 5% | 中密度纖維板 **1.12**（2015，工業局）；碳鋼冷軋鋼捲 2.5（2013） | Dimensional lumber 2.11→**2.33**；MDF 2.41→**2.66**（Exh.12-3 為 3.05→3.36） | Mistra 衣櫥/書櫃 0.286；餐桌 WRAP 2011 direct reuse 淨 +0.38 t/t（含收集） | 台灣無粒片板、合板係數；MDF 係數 10 年舊 |
| 金屬櫥櫃／鐵櫃／置物架 | 冷軋鋼 90%、粉體塗裝/塑膠 10% | 冷軋鋼捲 **2.94**、冷軋塗漆鋼捲 3.298（2013，中鋼）；碳鋼冷軋鋼捲 2.5（環境部）；EAF 鋼胚 0.4–0.68 | Steel cans 3.03→**3.34**；Structural steel 1.67→1.84 | DEFRA 鋼 4.005 `[secondary]` | 高爐 vs 電弧爐差 5 倍，需註明選哪個 |
| 辦公椅（網布/塑膠/鋼/鋁腳） | 鋼 40%、PP/尼龍 30%、PU 泡棉 15%、聚酯網布 10%、鋁 5% | PP 2.01、聚醯胺66 7.21、聚酯棉 4.17、鋁錠 9.85、冷軋鋼 2.94 | PP 1.52→1.68；Mixed metals 3.65→4.02；Aluminum ingot 7.48→8.24 | Mistra 椅子 **2.27**；WRAP 2011 每椅 >35 kgCO2e `[secondary]` | 無 PU 泡棉係數（僅 PU 合成皮 8.3–8.7） |
| 沙發／軟墊家具 | 粒片板 63%、PUR 9%、棉 8%、軟木 8%、鋼 8%、聚酯 3%（WRAP 2011） | MDF 1.12、天然棉混紡紗 4.42、聚酯棉 4.17、冷軋鋼 2.94 | 組合計算 | Mistra 沙發 **1.38**；WRAP 2011 sofa direct reuse 1.45 t/t（含 50% 取代、收集、處置）；CRA ≈4.4/kg | — |
| 桌上型電腦／筆電 | — | Acer 11.6 吋筆電 **81 kgCO2e/台**（2016，台/件單位） | Desktop CPUs 20.86→**23.0**；Portable electronic devices 29.83→**32.9**；Mixed electronics 20.79→22.9 | Mistra 資訊處理設備 77.3 | 台灣僅一筆成品；WARM 無螢幕尺寸區分 |
| 顯示器 | — | 平面顯示器用玻璃基板 5.86（原料） | Flat-panel displays 24.19→**26.7** | — | — |
| 印表機／事務機 | — | 無 | Hard-copy devices 7.65→**8.43**；Electronic peripherals 10.32→11.4 | — | — |
| 小家電 | — | 無 | Mixed electronics 20.79→22.9（偏高） | Mistra 吸塵器 7.06、洗碗機 3.62、洗衣機 4.06 | 台灣無 |
| 塑膠收納箱／塑膠製品 | PP/HDPE 100% | PP **2.01**、HDPE 2.25、PET 2.35、PVC 2.4、GPPS 1.97、ABS 再生粒 0.57、PC 4.60（2025） | Mixed plastics 1.87→**2.06** | — | — |
| 紡織（窗簾、制服、布品） | 聚酯 70%、棉 30% | 聚酯纖維(短纖) 5.0、聚酯棉 4.17、聚酯加工絲 5.04、天然棉混紡紗 4.42（原料級） | **無**（EPA 評估中） | DEFRA Clothing 22.31 `[secondary]`；Vinted 每件 0.45–2.44 | 原料→成衣加工排放缺；台灣值僅紗線級 |
| 紙本書籍／文件／紙箱 | 紙 100% | 未塗布印刷書寫用紙 **1.377**（2025）、原生木漿影印紙 4.244、瓦楞紙板 0.81–1.30（2023） | Textbooks 9.02→**9.94**；Office paper 7.95→8.76；Corrugated 5.58→6.15 | CRA 書 1.6 kg/件（0.5 kg） | WARM 含森林碳儲存，數值遠高於台灣，不可混用 |
| 玻璃／陶瓷器皿 | — | 平板玻璃 1.12、玻璃容器 1.02 | Glass 0.53→0.58 | Mistra 玻璃餐具 13.8（成品級，含加工） | 原料與成品落差大 |
| 其他 | 由 LLM 建議材質比例 | 依材質查表 | 依材質查表 | — | 需人工覆核 |

**解讀注意**：環境部係數多為「原料出廠」（cradle-to-gate 到原料），不含成品加工與運輸，會**系統性低估**成品排放；WARM 的紙/木含森林碳儲存信用，數值偏高；Mistra 為成品級混合 LCA/IO。三套不可在同一列相加後互比，報表須標明每列用哪一套。

---

## 6. 物品材質組成與重量的取得

**既有模型怎麼做**：WRAP 2011 用固定 BOM（沙發 8 種材質比例，餐桌 100% 木）；IVL 對每分類抽 10–50 則刊登人工判讀平均材質比例；Vaayu 用私有 taxonomy 對應 Kria 資料庫，對不上就用類別平均。沒有任何模型逐件查詢製造商資料。

**LCA 係數資料庫（授權）**
- ecoinvent：單人商業授權 CHF 1,650/年起、Developer CHF 4,500/年起；嵌入互動工具需另簽 sublicensing（<https://ecoinvent.org/licenses/commercial/>、<https://support.ecoinvent.org/licensing>）。
- Idemat（TU Delft）：CC BY-NC；嵌入軟體的商業授權 €250（openLCA Nexus <https://nexus.openlca.org/database/IDEMAT>）。
- Bath ICE：現稱 ICE Database Educational，**禁止商業使用與再散布**；商業用需購 IC+（<https://circularecology.com/ice-database-faqs.html>）。
- Climatiq：Starter 免費但 **non-commercial 且無 API**；API 僅 Enterprise；文件中無 avoided-emissions / reuse 端點，PCF 端點 cradle-to-gate（<https://www.climatiq.io/pricing>、<https://www.climatiq.io/docs>）。資料來源含 ecoinvent、EXIOBASE 等；ecoinvent「furniture, wooden」係數值為付費內容。

**產品資料 API**
- **IKEA**：無官方公開 API。社群 OpenAPI（idelsink/ikea-openapi，MIT，自述「基於網路請求分析、與 IKEA 無關、端點隨時可能變」）：Product Catalog `https://www.ikea.com/{country}/{language}/products/{suffix}/{id}.json` 的 `ProductDetails` schema 只有 name、price、typeName、mainImage、pipUrl 等，**沒有 weight 或 materials 欄位**；Sales Item API `https://api.salesitem.ingka.com` 需 `X-Client-ID`，提供庫存與「packaging information」（<https://github.com/idelsink/ikea-openapi>）。vrslev/ikea-api-client（Python）已於 2024-10 封存。IKEA 官網商品頁的「包裝」區塊有每箱重量，但抓取涉及服務條款。
- **Amazon**：PA-API 5 已退役（呼叫回 403 `AccessDeniedException`），改為 **Creators API**；需 Associates 帳號且**過去 30 天至少 10 筆合格銷售**（<https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction>）。PA-API 5 的 `ItemInfo.ProductInfo.ItemDimensions` 有 Height/Length/Weight/Width（DisplayValue + Unit），**無材質屬性**（舊文件已導向退役頁）。對 MegaWeaving 不可行。
- **UPCitemdb**：`weight`、`dimension` 為自由字串（如 "5.2 Pounds"），常為空，無材質；trial 端點有速率限制（<https://www.upcitemdb.com/wp/docs/main/development/responses/>）。Barcode Lookup：Weight 字串，需 API key。
- **GS1 Verified by GS1**：僅 7 個屬性（GTIN、品牌、描述、圖片、分類、淨含量、銷售國），**無重量/材質**；GDSN 有 grossWeight/netWeight 但為 B2B 供應鏈資料（<https://www.gs1uk.org/standards-services/data-services/verified-by-gs1>）。
- 結論：**沒有可商用、免費、含重量與材質的產品 API**。重量只能靠刊登者填寫（PRD 已定為組織物品必填）＋類別預設值；材質比例採「類別固定 BOM」為主，LLM 建議為輔。

---

## 7. LLM 的可為與不可為

**可為（且有先例）**
1. 分類：標題＋描述＋照片 → MegaWeaving 類別。Adevinta Cognition 團隊每月處理 2.2 億張二手物照片，從照片抽取欄位加速刊登（<https://medium.com/adevinta-tech-blog/learnings-from-building-machine-learning-products-at-scale-7d2963b45c1>）。
2. 估重量與材質比例並給信心分數：輸出結構化 `{category, weightKg, confidence, materials:[{name, share}]}`，低信心 → 退回類別預設值並標記待覆核。
3. 向刊登者追問：缺重量、尺寸、材質時生成 1–2 個問題（「是實木還是木心板？」「大約幾公斤？」）。
4. 文字→係數表的**比對**（entity linking）：DFKI 2025 用 LLM 把 BOM 元件對應到 LCA 資料庫條目（arXiv:2502.07418 <https://arxiv.org/abs/2502.07418>）；Climatiq 的 Mapping Agent 做同類事。
5. 產生「計算說明」文字（哪個係數、哪個取代率、哪個版本）。

**不可為**
- **不得生成或背誦排放係數**。PCFBench（arXiv:2608.27716）測八個前沿 LLM，給定 EPD 產品名稱與描述，組合式流程只有 37–58% 的產品落在查證值的 2 倍以內。係數必須來自版本化的表（環境部 CFP_P_02 快照 + WARM v16），LLM 只輸出表的 key。
- 不得決定取代率；取代率來自問卷統計。
- 不得在報表上「潤飾」數字；每筆計算要能回溯到 `factorId + factorVersion + weight + materialShares + replacementRate`。

---

## 8. MegaWeaving 建議方案

**採用骨架**：WRAP/IVL 結構 + Vaayu/WRAP 2025 問卷取代率，依 WBCSD 2023 原則報告。

**報表公式（建議原文顯示）**

```
每件估算避免排放量 (kgCO2e)
  = 重量 (kg) × Σ[材質比例 i × 材質係數 i (kgCO2e/kg, cradle-to-gate)] × 取代率 R
    − 平台配送排放 (Lalamove 實際里程 × 車種係數)

組織報表 = Σ 已完成交換之物品
```

- **係數來源順序**：① 環境部碳足跡排放係數資料庫（CFP_P_02，政府開放授權，附公告年份）→ ② EPA WARM v16（換算 ÷0.907，標註含森林碳儲存）→ ③ 無係數的類別列為「不計入」而非猜值。係數表以 JSON 版本化進 repo，記錄抓取日期。
- **取代率 R**：第一版採 **0.5**（WRAP 2011 預設、介於 Vinted 40% 與 WRAP 2025 64.6% 之間），並在報表標註「尚未實測」；第二版在接收者完成交換時加一題 Vaayu 式問卷（Yes=1、Maybe=0.5、No=0），每類別累積 ≥100 份後改用實測值。
- **雙欄顯示**：「潛在值（1:1 取代）」與「估算值（含取代率）」並列，與 SHE 的 potential / Vaayu 的 avoided 用法一致，避免被質疑只挑高值。
- **不計處置信用**（第一版）：台灣處置係數（焚化）未在環境部開放資料中找到可引用的逐材質值；待確認後再加。
- **措辭**（報表頁與 CSV 註腳）：
  > 「本數字為依公開排放係數估算之『避免排放量』，屬比較性估計，非碳權、非減量額度，不得用於抵減組織溫室氣體盤查或作為碳中和主張。係數來源：環境部碳足跡排放係數資料庫（YYYY-MM 快照）、US EPA WARM v16（2023-12）。取代率 R=0.5（假設值）。未經第三方查證。」
- **不做的事**：不呼叫 Climatiq/ecoinvent（授權與成本不符）；不接 IKEA/Amazon API；不讓 LLM 產生係數。

**對照 WBCSD 九原則的落點**：與盤查分開（報表獨立頁）、不作中和主張（措辭）、揭露參考情境（「購買同重量新品」）、揭露未查證（註腳）、揭露負面副作用（配送排放已扣除、反彈效應未計）。

---

## 9. 尚未確認 / Open questions

1. **環境部 CFP_P_02 的逐筆系統邊界**：資料集無邊界欄位，審查 SOP 說商品一律 cradle-to-gate，但 2013–2015 年公告的舊係數是否適用同一規則，需向氣候變遷署確認（聯絡：資料集頁所列 (02)2322-2050#66222）。
2. **台灣廢家具／廢電子焚化處置係數**：環境部新聞隱含 1.7 kgCO2/kg（焚化），但未找到正式公告的逐材質處置係數；旗艦計畫提到「可燃性廢棄物減碳係數 0.788 t/t」與「0.512 t/t」兩個數字，口徑不明。
3. **WARM v16 MDF 係數不一致**（Exhibit 1-1 −2.41 vs Exhibit 12-3 −3.05）：未查到 errata。
4. **WRAP 2011 Office Furniture 章節原始 PDF**：舊網址 wrap.org.uk 已失效，每椅 >35 kgCO2e、「50–80% 辦公椅/桌取代舊家具」等數字目前只有二手來源。
5. **環境部「2.06 kgCO2/kg 垃圾」原始推導頁**（清淨家園顧厝邊）未取得，不知是否含上游排放。GC贈物網企業案例數字吻合此係數（§2.6），代表它在國內實務上已被當成二手物減碳係數使用，更需要確認其口徑。
6. **Schibsted 2023 報告的 External Panel** 是指 Vaayu 自做的使用者問卷樣本，非第三方查證小組；報告是否經獨立查證未見聲明。
7. **Mistra 2019 家具係數**只從 DiVA 論文 Table 14 轉引，原報告 Appendix 4 的每 kg 表未逐筆核對。
8. **Amazon Creators API 回傳欄位**是否沿用 `ItemInfo.ProductInfo.ItemDimensions`：新文件未開放抓取，待核。
9. **IKEA Sales Item API 的 packaging 欄位**是否含重量：schema 目錄抓取失敗，只確認有「packaging information」描述。
10. ~~惜物網（臺北市）與愛二手物（i2so5）平台是否公告過減碳換算方式~~ **已確認（2026-11-08）**：兩者與 GC贈物網皆未公告，見 §2.6。GC `carbon_coefficient` 單位已確認為 gCO2e／件（§2.6）。仍待確認：電鍋 3,600,000 等異常值是輸入錯誤還是有意設定；個人影響力頁換算「度／塑膠袋／棵」的後端係數（只能向 GC 詢問）。
11. **碳足跡標籤誇大罰則條文**對「平台自行揭露估算避免排放」是否適用：需法規確認（目前 `[secondary]`）。
