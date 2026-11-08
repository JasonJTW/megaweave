// server/src/services/avoidedEmissions/factorTable.ts
// 避免排放量（avoided emissions）係數表。方法學、選值規則與驗證見
// docs/notes/avoided-emissions-model.md。每一個數字都要能回溯到 SOURCES 裡的一手來源；
// 不得在這裡放沒有出處的估計值（沒有係數的類別一律「不計入」）。
//
// 改任何數字都要：更新 FACTOR_TABLE_VERSION、更新方法學文件的係數表、跑單元測試。
// 環境部係數可用 `npm run check:emission-factors` 對照開放資料 API 是否有更新。

export const FACTOR_TABLE_VERSION = "2026-11-08";

// ---------------------------------------------------------------------------
// 來源
// ---------------------------------------------------------------------------

export const SOURCE_IDS = [
  "moenv-cfp-p-02",
  "epa-warm-v16",
  "wrap-2011-furniture",
  "unu-2026-ewaste",
  "cra-2020",
  "epd-steelcase-series1",
  "epd-hm-aeron",
  "epd-haworth-soji",
  "epd-kinnarps-6240",
  "epd-haworth-yourplace",
  "epd-bisley-glide",
  "epd-bisley-note-pedestal",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

export interface Source {
  id: SourceId;
  title: string;
  publisher: string;
  year: number;
  url: string;
  /** 本係數表引用時的取得日期 */
  retrievedAt: string;
}

export const SOURCES: Record<SourceId, Source> = {
  "moenv-cfp-p-02": {
    id: "moenv-cfp-p-02",
    title: "碳足跡排放係數資料庫（CFP_P_02）",
    publisher: "環境部",
    year: 2026,
    url: "https://data.moenv.gov.tw/dataset/detail/CFP_P_02",
    retrievedAt: "2026-11-08",
  },
  "epa-warm-v16": {
    id: "epa-warm-v16",
    title:
      "Documentation for Greenhouse Gas Emission and Energy Factors Used in the Waste Reduction Model (WARM), Version 16: Management Practices Chapters (EPA-530-R-23-018) and Electronics chapter",
    publisher: "U.S. Environmental Protection Agency",
    year: 2023,
    url: "https://www.epa.gov/waste-reduction-model/documentation-waste-reduction-model-warm",
    retrievedAt: "2026-11-08",
  },
  "wrap-2011-furniture": {
    id: "wrap-2011-furniture",
    title: "Benefits of Reuse Case Study: Domestic Furniture",
    publisher: "WRAP (Fisher, James & Maddox, ERM)",
    year: 2011,
    url: "https://www.wrap.ngo/sites/default/files/2020-09/WRAP-Domestic%20Furniture%20chapter_final.pdf",
    retrievedAt: "2026-11-08",
  },
  "unu-2026-ewaste": {
    id: "unu-2026-ewaste",
    title:
      "E-waste Statistics: Guidelines on Classifications, Reporting and Indicators, Third Edition (Lysaght, Forti et al.), Annex 6 / Table 25",
    publisher: "UNITAR SCYCLE / Zenodo（CC BY 4.0）",
    year: 2026,
    url: "https://zenodo.org/records/18328494",
    retrievedAt: "2026-11-08",
  },
  "cra-2020": {
    id: "cra-2020",
    title: "Reuse Impact Calculator Methodology",
    publisher: "Charitable Recycling Australia",
    year: 2020,
    url: "https://www.charitablereuse.org.au/wp-content/uploads/2020/08/Reuse-Impact-Calculator-Methodology.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-steelcase-series1": {
    id: "epd-steelcase-series1",
    title: "Environmental Product Declaration: Steelcase Series 1 (EPD10930)",
    publisher: "Steelcase / NSF International",
    year: 2024,
    url: "https://info.nsf.org/Certified/Sustain/ProdCert/EPD10930.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-hm-aeron": {
    id: "epd-hm-aeron",
    title:
      "Environmental Product Declaration: Aeron Chair Aluminum Base (EPD10431)",
    publisher: "Herman Miller / NSF International",
    year: 2022,
    url: "https://info.nsf.org/Certified/Sustain/ProdCert/EPD10431.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-haworth-soji": {
    id: "epd-haworth-soji",
    title:
      "Environmental Product Declaration: Soji Task Seating, Europe (EPD-IES-0012459:006)",
    publisher: "Haworth / EPD International",
    year: 2025,
    url: "https://www.haworth.com/content/dam/digital/eu/docs/products/haworth/chairs/soji/soji_sustain_epd_eu-en_2025.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-kinnarps-6240": {
    id: "epd-kinnarps-6240",
    title:
      "Environmental Product Declaration: Task Chair 6000/8000, 6240 (NEPD-3617-2541-EN)",
    publisher: "Kinnarps / EPD-Norge",
    year: 2022,
    url: "https://www.epd-global.com/getfile.php/13223146-1741754522/EPDer/M%C3%B8bler/Sittem%C3%B8bler/NEPD-3617-2541_6000-8000-series---Task-chair-6240-with-wool-fabric-and-plastic-starbase.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-haworth-yourplace": {
    id: "epd-haworth-yourplace",
    title:
      "Environmental Product Declaration: YourPlace Core Rectangular Desk, EMEA (EPD-IES-0015450:003)",
    publisher: "Haworth / EPD International",
    year: 2025,
    url: "https://www.environdec.com/library/epd15450",
    retrievedAt: "2026-11-08",
  },
  "epd-bisley-glide": {
    id: "epd-bisley-glide",
    title:
      "Environmental Product Declaration: Bisley Glide Sliding-door Unit (S-P-01613，有效期至 2024-08-28)",
    publisher: "Bisley / EPD International",
    year: 2019,
    url: "https://www.bisley.com/site/assets/files/38292/s-p-01613_epd_bisley_sliding_door_storage_units.pdf",
    retrievedAt: "2026-11-08",
  },
  "epd-bisley-note-pedestal": {
    id: "epd-bisley-note-pedestal",
    title:
      "Environmental Product Declaration: Bisley Storage Pedestals (S-P-01616，有效期至 2024-08-28)",
    publisher: "Bisley / EPD International",
    year: 2019,
    url: "https://cdn3.evostore.io/documents/bisley_ireland/s_p_01616_epd_bisley_storage_pedestals_1.pdf",
    retrievedAt: "2026-11-08",
  },
};

// ---------------------------------------------------------------------------
// 材質係數（被取代新品的原料生產排放，kgCO2e/kg，搖籃到大門）
// 選值規則：①名稱最貼近該材質的記錄 ②同樣貼近時取公告年較新者（審查 SOP「應優先引用年份較新之係數」）
// ③同年取較低值。環境部記錄以 name + announcementYear 唯一識別，供核對腳本比對 API。
// ---------------------------------------------------------------------------

export const MATERIAL_IDS = [
  "steel",
  "aluminium",
  "polyamide",
  "polypropylene",
  "plastic_unspecified",
  "wood_panel",
  "polyester_fibre",
  "cotton_yarn",
  "paper",
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

export interface MoenvRecordRef {
  name: string;
  announcementYear: string;
  departmentName: string;
  /** API 回傳的 coe 原字串，核對腳本逐字比對 */
  coe: string;
  unit: string;
}

export interface MaterialFactor {
  id: MaterialId;
  nameZh: string;
  kgCO2ePerKg: number;
  sourceId: SourceId;
  moenvRecord: MoenvRecordRef;
  note?: string;
}

export const MATERIAL_FACTORS: Record<MaterialId, MaterialFactor> = {
  steel: {
    id: "steel",
    nameZh: "碳鋼（冷軋鋼板）",
    kgCO2ePerKg: 2.5,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "碳鋼冷軋鋼捲",
      announcementYear: "2013",
      departmentName: "環境部",
      coe: "2.5",
      unit: "公斤(kg)",
    },
    note: "同年中鋼「冷軋鋼捲」2.94 為單一廠商值，取環境部通用值且較低者。不鏽鋼零件也套此值（不鏽鋼係數較高，偏保守）。",
  },
  aluminium: {
    id: "aluminium",
    nameZh: "鋁",
    kgCO2ePerKg: 9.8493,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "鋁錠",
      announcementYear: "2013",
      departmentName: "經濟部工業局",
      coe: "9.8493",
      unit: "公斤(kg)",
    },
    note: "原生鋁錠；家具壓鑄鋁常含再生料（環境部「再生鋁錠」0.7），此值對高再生料產品偏高，見方法學文件驗證段。",
  },
  polyamide: {
    id: "polyamide",
    nameZh: "尼龍（聚醯胺 6）",
    kgCO2ePerKg: 3.83,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "聚醯胺6",
      announcementYear: "2013",
      departmentName: "經濟部工業局",
      coe: "3.83",
      unit: "公斤(kg)",
    },
    note: "辦公椅椅腳、椅框多為 PA6；聚醯胺66（7.21）與聚醯胺粒（7.1）名稱較不貼近且較高。",
  },
  polypropylene: {
    id: "polypropylene",
    nameZh: "聚丙烯（PP）",
    kgCO2ePerKg: 1.95,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "聚丙烯(PP)",
      announcementYear: "2023",
      departmentName: "環境部",
      coe: "1.95",
      unit: "公斤(kg)",
    },
    note: "同名另有 2013 年 2.01（經濟部工業局），依審查 SOP 取較新者。",
  },
  plastic_unspecified: {
    id: "plastic_unspecified",
    nameZh: "其他塑膠（PU、POM、ABS 等無台灣係數者，以 PP 代理）",
    kgCO2ePerKg: 1.95,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "聚丙烯(PP)",
      announcementYear: "2023",
      departmentName: "環境部",
      coe: "1.95",
      unit: "公斤(kg)",
    },
    note: "環境部資料庫沒有 PU 泡棉、POM、原生 ABS 係數；PP 是庫內塑膠類最低值之一（LDPE 1.9、PP 1.95、EPS 1.96），用作下限代理。",
  },
  wood_panel: {
    id: "wood_panel",
    nameZh: "木質板材（中密度纖維板／粒片板）",
    kgCO2ePerKg: 1.12,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "中密度纖維板",
      announcementYear: "2015",
      departmentName: "經濟部工業局「103年製造業產品碳足跡輔導與推廣計畫」",
      coe: "1.12",
      unit: "公斤(kg)",
    },
    note: "資料庫無粒片板、合板係數，粒片板以 MDF 代理。實木（軟木）沒有可引用的台灣係數，BOM 中列為 0。",
  },
  polyester_fibre: {
    id: "polyester_fibre",
    nameZh: "聚酯纖維",
    kgCO2ePerKg: 4.45,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "聚酯棉",
      announcementYear: "2020",
      departmentName: "環境部",
      coe: "4.45",
      unit: "公斤(kg)",
    },
    note: "同名另有 2016 年 4.17，取較新者。纖維級係數，不含織布、染整、裁縫。",
  },
  cotton_yarn: {
    id: "cotton_yarn",
    nameZh: "棉紗",
    kgCO2ePerKg: 4.42,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "天然棉混紡紗",
      announcementYear: "2017",
      departmentName: "環境部",
      coe: "4.42",
      unit: "公斤(kg)",
    },
    note: "紗線級係數，不含織布、染整、裁縫。",
  },
  paper: {
    id: "paper",
    nameZh: "印刷書寫用紙",
    kgCO2ePerKg: 1.377,
    sourceId: "moenv-cfp-p-02",
    moenvRecord: {
      name: "未塗布印刷書寫用紙",
      announcementYear: "2025",
      departmentName: "環境部氣候變遷署",
      coe: "1.377",
      unit: "公斤(kg)",
    },
    note: "紙張級係數，不含印刷與裝訂。",
  },
};

// ---------------------------------------------------------------------------
// 產品係數（電子產品；材質法會嚴重低估晶片與面板製造，改用產品級係數）
// EPA WARM v16 source reduction（current mix），單位 MTCO2E/short ton。
// WARM Management Practices §1.3.2：生產排放可取 source reduction 係數的絕對值；
// Electronics 章 §1.4.1 明列「使用捐贈品取代購買新電子產品」屬 source reduction。
// 電子產品的 current mix 即 100% 原生料（Electronics 章 Exhibit 1-5 註 a）。
// ---------------------------------------------------------------------------

/** 1 short ton = 907.18474 kg；1 MTCO2E/short ton = 1000/907.18474 kgCO2e/kg */
export const KG_PER_SHORT_TON = 907.18474;

export const PRODUCT_FACTOR_IDS = [
  "warm_desktop_cpus",
  "warm_portable_electronic_devices",
  "warm_flat_panel_displays",
  "warm_electronic_peripherals",
  "warm_hard_copy_devices",
] as const;

export type ProductFactorId = (typeof PRODUCT_FACTOR_IDS)[number];

export interface ProductFactor {
  id: ProductFactorId;
  warmMaterial: string;
  /** 原值（取絕對值前為負數的 source reduction 係數） */
  mtco2ePerShortTon: number;
  sourceId: SourceId;
  locator: string;
}

export const PRODUCT_FACTORS: Record<ProductFactorId, ProductFactor> = {
  warm_desktop_cpus: {
    id: "warm_desktop_cpus",
    warmMaterial: "Desktop CPUs",
    mtco2ePerShortTon: 20.86,
    sourceId: "epa-warm-v16",
    locator:
      "Management Practices ch.1 Exhibit 1-1 p.1-2；Electronics ch. Exhibit 1-5 p.1-4、Exhibit 1-7 p.1-7",
  },
  warm_portable_electronic_devices: {
    id: "warm_portable_electronic_devices",
    warmMaterial: "Portable Electronic Devices",
    mtco2ePerShortTon: 29.83,
    sourceId: "epa-warm-v16",
    locator:
      "Management Practices ch.1 Exhibit 1-1 p.1-2；Electronics ch. Exhibit 1-5 p.1-4、Exhibit 1-7 p.1-7",
  },
  warm_flat_panel_displays: {
    id: "warm_flat_panel_displays",
    warmMaterial: "Flat-Panel Displays",
    mtco2ePerShortTon: 24.19,
    sourceId: "epa-warm-v16",
    locator:
      "Management Practices ch.1 Exhibit 1-1 p.1-2；Electronics ch. Exhibit 1-5 p.1-4、Exhibit 1-7 p.1-7",
  },
  warm_electronic_peripherals: {
    id: "warm_electronic_peripherals",
    warmMaterial: "Electronic Peripherals",
    mtco2ePerShortTon: 10.32,
    sourceId: "epa-warm-v16",
    locator:
      "Management Practices ch.1 Exhibit 1-1 p.1-2；Electronics ch. Exhibit 1-5 p.1-4、Exhibit 1-7 p.1-7",
  },
  warm_hard_copy_devices: {
    id: "warm_hard_copy_devices",
    warmMaterial: "Hard-Copy Devices",
    mtco2ePerShortTon: 7.65,
    sourceId: "epa-warm-v16",
    locator:
      "Management Practices ch.1 Exhibit 1-1 p.1-2；Electronics ch. Exhibit 1-5 p.1-4、Exhibit 1-7 p.1-7",
  },
};

// ---------------------------------------------------------------------------
// 材質組成（BOM）
// 參考產品的元件重量直接抄自 EPD 材質表；material 為 null 表示沒有可引用的台灣係數，
// 計 0 但保留在總重中（稀釋係數，偏保守）。
// ---------------------------------------------------------------------------

export interface BomComponent {
  label: string;
  material: MaterialId | null;
  /** 參考產品為 kg；固定比例 BOM 為百分比。同一個 BOM 內單位一致即可。 */
  amount: number;
}

export interface ReferenceProduct {
  sourceId: SourceId;
  productName: string;
  locator: string;
  /** EPD 宣告的產品重量 */
  declaredMassKg: number;
  /** EPD 的 A1–A3（搖籃到大門）GWP；類別係數取材質法與 EPD 平均的較低者 */
  a1a3KgCO2e: number;
  a1a3Locator: string;
  components: BomComponent[];
}

const SERIES_1: ReferenceProduct = {
  sourceId: "epd-steelcase-series1",
  productName: "Steelcase Series 1（435A00，Americas 典型配置）",
  locator: "Material content 表（typical configuration）",
  declaredMassKg: 13.787,
  a1a3KgCO2e: 74.1,
  a1a3Locator:
    "Life cycle impact 表：Materials acquisition 5.57E+01 + Production 1.84E+01",
  components: [
    { label: "Nylon (PA6 and PA66)", material: "polyamide", amount: 5.752 },
    { label: "Steel", material: "steel", amount: 3.928 },
    { label: "Polypropylene", material: "polypropylene", amount: 2.514 },
    { label: "Aluminum", material: "aluminium", amount: 0.625 },
    { label: "Polyurethane", material: "plastic_unspecified", amount: 0.563 },
    {
      label: "Polyoxymethylene",
      material: "plastic_unspecified",
      amount: 0.261,
    },
    { label: "Other", material: null, amount: 0.142 },
  ],
};

const AERON: ReferenceProduct = {
  sourceId: "epd-hm-aeron",
  productName: "Herman Miller Aeron（鋁椅腳，B 尺寸）",
  locator: "Material Declaration 表",
  declaredMassKg: 20.63,
  a1a3KgCO2e: 58.0,
  a1a3Locator: "CML Results 表 GWP A1-A3 5.80E+01",
  components: [
    { label: "Aluminum", material: "aluminium", amount: 10.41 },
    { label: "Polyamide 6", material: "polyamide", amount: 4.43 },
    { label: "Steel", material: "steel", amount: 2.8 },
    {
      label: "Thermoplastic Ether Ester Elastomer",
      material: "plastic_unspecified",
      amount: 0.51,
    },
    {
      label: "Polyoxymethylene",
      material: "plastic_unspecified",
      amount: 0.41,
    },
    {
      label: "Polyurethane Foam",
      material: "plastic_unspecified",
      amount: 0.4,
    },
    { label: "Fiberglass", material: null, amount: 0.3 },
    {
      label: "Copolyester Ether",
      material: "plastic_unspecified",
      amount: 0.29,
    },
    { label: "Polypropylene", material: "polypropylene", amount: 0.26 },
    { label: "Stainless Steel", material: "steel", amount: 0.24 },
    { label: "Recycled PET", material: null, amount: 0.2 },
    { label: "Other Materials", material: null, amount: 0.34 },
  ],
};

const SOJI: ReferenceProduct = {
  sourceId: "epd-haworth-soji",
  productName: "Haworth Soji（鋁椅腳，歐洲製）",
  locator: "Product composition 表（總重 19.0 kg）",
  declaredMassKg: 19.0,
  a1a3KgCO2e: 142,
  a1a3Locator: "EN 15804+A2 表 GWP-GHG A1-A3（grid）1.42E+02",
  components: [
    { label: "Steel", material: "steel", amount: 6.88 },
    { label: "Nylon PA6", material: "polyamide", amount: 4.88 },
    { label: "Fiberboard", material: "wood_panel", amount: 2.43 },
    { label: "Aluminum", material: "aluminium", amount: 2.17 },
    { label: "Polyurethane", material: "plastic_unspecified", amount: 1.12 },
    { label: "Polyester Fabric", material: "polyester_fibre", amount: 0.58 },
    { label: "Polypropylene", material: "polypropylene", amount: 0.37 },
    {
      label: "Polyoxymethylene",
      material: "plastic_unspecified",
      amount: 0.35,
    },
    { label: "Other", material: null, amount: 0.18 },
  ],
};

const KINNARPS_6240: ReferenceProduct = {
  sourceId: "epd-kinnarps-6240",
  productName: "Kinnarps Task Chair 6240（羊毛布、塑膠椅腳）",
  locator: "Materials 表（總重 20.03 kg）",
  declaredMassKg: 20.03,
  a1a3KgCO2e: 79.4,
  a1a3Locator: "Key environmental indicators：Global warming A1-A3 79,40",
  components: [
    { label: "Metal - Aluminium", material: "aluminium", amount: 1.89 },
    { label: "Metal - Steel", material: "steel", amount: 12.37 },
    {
      label: "Textile - Polyester",
      material: "polyester_fibre",
      amount: 0.01,
    },
    { label: "Textile - Wool", material: null, amount: 0.51 },
    { label: "Glass fibre", material: null, amount: 0.01 },
    {
      label: "Plastic - Polyurethane (PUR)",
      material: "plastic_unspecified",
      amount: 1.56,
    },
    { label: "Wood - MDF", material: "wood_panel", amount: 0.67 },
    {
      label: "Plastic - Polypropylene",
      material: "polypropylene",
      amount: 0.68,
    },
    {
      label: "Plastic - Polyoxymethylene",
      material: "plastic_unspecified",
      amount: 0.09,
    },
    { label: "Wood - Plywood", material: "wood_panel", amount: 0.15 },
    { label: "Powder coating", material: null, amount: 0.03 },
    { label: "Plastic - Nylon (PA)", material: "polyamide", amount: 0.34 },
    // PAGF30 = 70% 聚醯胺 + 30% 玻璃纖維，玻纖部分不計
    { label: "PAGF30（70% 聚醯胺）", material: "polyamide", amount: 1.197 },
    { label: "PAGF30（30% 玻璃纖維）", material: null, amount: 0.513 },
  ],
};

const YOURPLACE: ReferenceProduct = {
  sourceId: "epd-haworth-yourplace",
  productName:
    "Haworth YourPlace Core 固定式辦公桌 1600×800（美耐皿板、鋼 H 腳）",
  locator: "Product composition 表（總重 37.4 kg）",
  declaredMassKg: 37.4,
  a1a3KgCO2e: 60.0,
  a1a3Locator: "EN 15804+A2 表 GWP-GHG A1-A3（grid）6.00E+01",
  components: [
    { label: "Fiberboard", material: "wood_panel", amount: 19.84 },
    { label: "Steel", material: "steel", amount: 15.61 },
    { label: "Aluminum", material: "aluminium", amount: 1.19 },
    {
      label: "Acrylonitrile Butadiene Styrene",
      material: "plastic_unspecified",
      amount: 0.38,
    },
    { label: "Other", material: null, amount: 0.37 },
  ],
};

// Bisley 只公布質量百分比，元件重量 = 最小尺寸產品重量 × 百分比
const BISLEY_GLIDE: ReferenceProduct = {
  sourceId: "epd-bisley-glide",
  productName: "Bisley Glide 拉門鋼櫃（最小尺寸 743×800×470）",
  locator: "Material composition 表（steel 98–99%）、Mass 表 31 kg",
  declaredMassKg: 31,
  a1a3KgCO2e: 88.1,
  a1a3Locator:
    "GWP fossil，smallest unit：Upstream 7.72E+01 + Core 1.09E+01（Upstream＝搖籃到大門，Core＝製造）",
  components: [
    { label: "steel（取下限 98%）", material: "steel", amount: 31 * 0.98 },
    {
      label: "other metals: aluminium, nickel, zinc（1%）",
      material: null,
      amount: 31 * 0.01,
    },
    {
      label: "other polymers（<1%，取 1%）",
      material: "plastic_unspecified",
      amount: 31 * 0.01,
    },
  ],
};

const BISLEY_NOTE: ReferenceProduct = {
  sourceId: "epd-bisley-note-pedestal",
  productName: "Bisley Note 活動櫃（最小尺寸 495×300×565）",
  locator:
    "Material composition 表（Note：steel 98%、polymers 1.5–2%）、Mass 表 16 kg",
  declaredMassKg: 16,
  a1a3KgCO2e: 54.94,
  a1a3Locator: "GWP fossil，smallest unit：Upstream 4.52E+01 + Core 9.74E+00",
  components: [
    { label: "steel（98%）", material: "steel", amount: 16 * 0.98 },
    {
      label: "other polymers（1.5–2%，取 2%）",
      material: "plastic_unspecified",
      amount: 16 * 0.02,
    },
  ],
};

export const REFERENCE_PRODUCTS = {
  office_chair: [SERIES_1, AERON, SOJI, KINNARPS_6240],
  desk_table: [YOURPLACE],
  steel_storage: [BISLEY_GLIDE, BISLEY_NOTE],
} as const;

// ---------------------------------------------------------------------------
// 類別
// ---------------------------------------------------------------------------

export const CATEGORY_IDS = [
  "office_chair",
  "desk_table",
  "wood_storage",
  "steel_storage",
  "upholstered_seating",
  "desktop_computer",
  "laptop_tablet",
  "mobile_phone",
  "display",
  "printer",
  "it_peripheral",
  "plastic_goods",
  "books_paper",
  "textiles",
  "small_appliance",
  "other",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export type FactorMethod =
  | {
      kind: "reference_products";
      /** 多個參考產品的元件合併成一份 BOM（質量加權），等同 IVL 的抽樣平均材質比例 */
      products: readonly ReferenceProduct[];
    }
  | {
      kind: "fixed_bom";
      sourceNote: string;
      sourceId: SourceId | null;
      components: BomComponent[];
    }
  | { kind: "product_factor"; productFactorId: ProductFactorId }
  | { kind: "not_counted"; reason: string };

/**
 * 電子產品預設重量取 UNU 指引第 3 版 Annex 6（Table 25，p.163）最新一年的每台平均重量。
 * 該表不含電池重量（偏輕，偏保守）。快照：docs/notes/data/unu-ewaste-guidelines-ed3-annex6-average-weights-2026-11-08.csv
 */
export const UNU_WEIGHT_YEAR = "2024";

export interface DefaultWeight {
  kg: number;
  sourceId: SourceId;
  locator: string;
  /** 取自 UNU Annex 6 時的 UNU-KEY，測試會比對快照的 UNU_WEIGHT_YEAR 欄 */
  unuKey?: string;
}

export interface CategoryProfile {
  id: CategoryId;
  nameZh: string;
  examplesZh: string;
  method: FactorMethod;
  /** 上架表單預填值；null 表示沒有可引用的平均重量，必須由刊登者填寫 */
  defaultWeight: DefaultWeight | null;
}

export const CATEGORIES: Record<CategoryId, CategoryProfile> = {
  office_chair: {
    id: "office_chair",
    nameZh: "辦公椅",
    examplesZh: "辦公椅、會議椅、電腦椅",
    method: {
      kind: "reference_products",
      products: REFERENCE_PRODUCTS.office_chair,
    },
    defaultWeight: {
      kg: 13.8,
      sourceId: "epd-steelcase-series1",
      locator: "四份辦公椅 EPD 中最輕者（13.787 kg）",
    },
  },
  desk_table: {
    id: "desk_table",
    nameZh: "辦公桌／會議桌",
    examplesZh: "OA 辦公桌、會議桌、工作桌（固定高度）",
    method: {
      kind: "reference_products",
      products: REFERENCE_PRODUCTS.desk_table,
    },
    defaultWeight: {
      kg: 37.4,
      sourceId: "epd-haworth-yourplace",
      locator: "1600×800 桌，Product composition 表",
    },
  },
  wood_storage: {
    id: "wood_storage",
    nameZh: "木質櫃架",
    examplesZh: "書櫃、木櫃、層架（板材）",
    method: {
      kind: "fixed_bom",
      sourceId: null,
      sourceNote:
        "類別定義：板材櫃架以 100% 木質板材計，鉸鏈、滑軌等五金不計（金屬係數較高，省略偏保守）。",
      components: [{ label: "木質板材", material: "wood_panel", amount: 100 }],
    },
    defaultWeight: {
      kg: 11,
      sourceId: "cra-2020",
      locator:
        "§6 Other Home Furniture under 15kg：平均 11 kg（FRN 2009），取兩級中較輕者",
    },
  },
  steel_storage: {
    id: "steel_storage",
    nameZh: "金屬櫃架",
    examplesZh: "鐵櫃、公文櫃、活動櫃、置物櫃、鐵架",
    method: {
      kind: "reference_products",
      products: REFERENCE_PRODUCTS.steel_storage,
    },
    defaultWeight: {
      kg: 16,
      sourceId: "epd-bisley-note-pedestal",
      locator: "兩份鋼櫃 EPD 中最輕的產品尺寸（Note 活動櫃 16 kg）",
    },
  },
  upholstered_seating: {
    id: "upholstered_seating",
    nameZh: "沙發與軟墊座椅",
    examplesZh: "沙發、等候椅、軟墊單椅",
    method: {
      kind: "fixed_bom",
      sourceId: "wrap-2011-furniture",
      sourceNote: "WRAP 2011 p.8「average sofa」材質比例",
      components: [
        { label: "particleboard", material: "wood_panel", amount: 63 },
        { label: "foam (PUR)", material: "plastic_unspecified", amount: 9 },
        { label: "woven cotton", material: "cotton_yarn", amount: 8 },
        { label: "softwood", material: null, amount: 8 },
        { label: "low alloyed steel", material: "steel", amount: 8 },
        { label: "polyester", material: "polyester_fibre", amount: 3 },
        { label: "phosphorous (flame retardants)", material: null, amount: 1 },
        { label: "melamine", material: null, amount: 1 },
      ],
    },
    defaultWeight: {
      kg: 37.7,
      sourceId: "cra-2020",
      locator: "§6 Upholstered Furniture：mid-sized sofa/chair 37.7 kg",
    },
  },
  desktop_computer: {
    id: "desktop_computer",
    nameZh: "桌上型電腦主機",
    examplesZh: "桌機主機（不含螢幕、鍵鼠）",
    method: { kind: "product_factor", productFactorId: "warm_desktop_cpus" },
    defaultWeight: {
      kg: 6.26,
      sourceId: "unu-2026-ewaste",
      locator: "Annex 6 Table 25，UNU-KEY 0302 Desktop PCs，2024 年",
      unuKey: "0302",
    },
  },
  laptop_tablet: {
    id: "laptop_tablet",
    nameZh: "筆電／平板",
    examplesZh: "筆記型電腦、平板電腦",
    method: {
      kind: "product_factor",
      productFactorId: "warm_portable_electronic_devices",
    },
    // 1.35 × 32.88 = 44.4 kgCO2e，低於環境部 Acer 11.6 吋筆電碳足跡 81 kgCO2e/台（CFP_P_02，2016）。
    // 舊版 UNU 2015 Annex 3 的 3.0 kg（EU-28 2012 年）會算出 98.6，高於台灣值，已不用。
    defaultWeight: {
      kg: 1.35,
      sourceId: "unu-2026-ewaste",
      locator:
        "Annex 6 Table 25，UNU-KEY 0303 Laptops (incl. tablets)，2024 年，不含電池",
      unuKey: "0303",
    },
  },
  mobile_phone: {
    id: "mobile_phone",
    nameZh: "手機",
    examplesZh: "智慧型手機、功能型手機",
    method: {
      kind: "product_factor",
      productFactorId: "warm_portable_electronic_devices",
    },
    defaultWeight: {
      kg: 0.08,
      sourceId: "unu-2026-ewaste",
      locator:
        "Annex 6 Table 25，UNU-KEY 0306 Mobile Phones，2024 年，不含電池",
      unuKey: "0306",
    },
  },
  display: {
    id: "display",
    nameZh: "螢幕／電視",
    examplesZh: "LCD／LED 電腦螢幕、平面電視",
    method: {
      kind: "product_factor",
      productFactorId: "warm_flat_panel_displays",
    },
    defaultWeight: {
      kg: 8.2,
      sourceId: "unu-2026-ewaste",
      locator:
        "Annex 6 Table 25，UNU-KEY 0309 Flat-Panel Display Monitors，2024 年；平面電視 0408 為 14.68，取較輕者",
      unuKey: "0309",
    },
  },
  printer: {
    id: "printer",
    nameZh: "印表機／事務機",
    examplesZh: "印表機、多功能事務機、掃描器",
    method: {
      kind: "product_factor",
      productFactorId: "warm_hard_copy_devices",
    },
    defaultWeight: {
      kg: 12.13,
      sourceId: "unu-2026-ewaste",
      locator: "Annex 6 Table 25，UNU-KEY 0304 Printers，2024 年",
      unuKey: "0304",
    },
  },
  it_peripheral: {
    id: "it_peripheral",
    nameZh: "電腦周邊",
    examplesZh: "鍵盤、滑鼠、外接硬碟、路由器",
    method: {
      kind: "product_factor",
      productFactorId: "warm_electronic_peripherals",
    },
    defaultWeight: {
      kg: 0.4,
      sourceId: "unu-2026-ewaste",
      locator: "Annex 6 Table 25，UNU-KEY 0301 Small IT equipment，2024 年",
      unuKey: "0301",
    },
  },
  plastic_goods: {
    id: "plastic_goods",
    nameZh: "塑膠收納與塑膠製品",
    examplesZh: "收納箱、整理籃、塑膠椅",
    method: {
      kind: "fixed_bom",
      sourceId: null,
      sourceNote: "類別定義：以 100% PP 計（收納箱主要材質）。",
      components: [{ label: "PP", material: "polypropylene", amount: 100 }],
    },
    defaultWeight: null,
  },
  books_paper: {
    id: "books_paper",
    nameZh: "書籍與紙本",
    examplesZh: "書、雜誌、文件夾（紙）",
    method: {
      kind: "fixed_bom",
      sourceId: null,
      sourceNote: "類別定義：以 100% 印刷書寫用紙計，印刷與裝訂不計。",
      components: [{ label: "紙", material: "paper", amount: 100 }],
    },
    defaultWeight: {
      kg: 0.5,
      sourceId: "cra-2020",
      locator: "§6 Books and Magazines：500 g average weight per item",
    },
  },
  textiles: {
    id: "textiles",
    nameZh: "布品與衣物",
    examplesZh: "制服、窗簾、桌巾、衣物",
    method: {
      kind: "fixed_bom",
      sourceId: null,
      sourceNote:
        "類別定義：以兩大纖維（聚酯 4.45、棉 4.42）中較低的棉紗係數計，不含織布、染整、裁縫。",
      components: [{ label: "纖維", material: "cotton_yarn", amount: 100 }],
    },
    defaultWeight: {
      kg: 0.25,
      sourceId: "cra-2020",
      locator: "§6 T-shirt：weight is 250 grams（衣物類最輕者）",
    },
  },
  small_appliance: {
    id: "small_appliance",
    nameZh: "小家電",
    examplesZh: "電風扇、電熱水壺、微波爐、除濕機",
    method: {
      kind: "not_counted",
      reason:
        "環境部資料庫無家電成品係數；WARM 不含家電；材質法缺馬達與電子零件，暫不計入。",
    },
    defaultWeight: null,
  },
  other: {
    id: "other",
    nameZh: "其他",
    examplesZh: "不屬於以上類別的物品",
    method: {
      kind: "not_counted",
      reason: "材質不明，無法對應係數。",
    },
    defaultWeight: null,
  },
};

// ---------------------------------------------------------------------------
// 取代率 R：每一件再使用品有多少比例真的取代了一件新品的生產
// ---------------------------------------------------------------------------

export interface ReplacementRate {
  value: number;
  status: "assumed" | "surveyed";
  sourceId: SourceId;
  locator: string;
}

export const DEFAULT_REPLACEMENT_RATE: ReplacementRate = {
  value: 0.5,
  status: "assumed",
  sourceId: "wrap-2011-furniture",
  locator:
    "p.10「50% of reuse is displacement of a new item」；p.11 作者註明尚無實證資料",
};

/** 問卷取代率（Vaayu 2023 作法）至少需要的有效樣本數，未達則沿用預設值 */
export const MIN_SURVEY_SAMPLE = 100;
