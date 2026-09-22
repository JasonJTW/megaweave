// server/src/benchmark/fixture/vocabulary.ts
// Fixture 用字庫：分類 ID 對應 server/db/reference-data.sql，物品名稱取自各分類說明；
// 地點僅使用行政區中心座標，地址與名稱皆為虛構，不含任何真實使用者資料。

export interface CategoryVocabulary {
  id: number;
  /** 該分類下的物品名稱；每個名稱同時是一個向量主題 (topic) */
  nouns: readonly string[];
  tags: readonly string[];
}

export const CATEGORIES: readonly CategoryVocabulary[] = [
  { id: 1, nouns: ["電冰箱", "洗衣機", "冷氣", "電風扇", "微波爐", "電鍋", "烤箱", "吸塵器", "除濕機", "飲水機", "電暖器"], tags: ["家電", "小家電", "廚房", "節能"] },
  { id: 2, nouns: ["寵物飼料", "寵物推車", "貓砂盆", "寵物玩具", "寵物屋", "輪椅", "助行器"], tags: ["寵物", "貓", "狗", "輔具"] },
  { id: 3, nouns: ["展櫃", "展台", "展板", "帆布", "展示道具", "軌道燈", "塗料", "木板", "包裝材", "棧板", "地墊"], tags: ["建材", "展覽", "木作", "裝修"] },
  { id: 4, nouns: ["雜物", "紙箱", "禮盒", "收藏品", "紀念品"], tags: ["其他", "雜物"] },
  { id: 5, nouns: ["小說", "雜誌", "漫畫", "文具", "畫具", "筆記本", "教科書", "製圖工具"], tags: ["書籍", "文創", "學生", "閱讀"] },
  { id: 6, nouns: ["外套", "運動鞋", "牛仔褲", "洋裝", "機能服", "後背包", "手錶", "飾品", "圍巾"], tags: ["服飾", "女裝", "男裝", "配件"] },
  { id: 7, nouns: ["書桌", "椅子", "檯燈", "鍋具", "收納箱", "工具組", "清潔用品", "床墊", "窗簾", "腳踏車", "盆栽", "露營椅"], tags: ["家具", "居家", "收納", "搬家"] },
  { id: 8, nouns: ["嬰兒床", "尿布", "童裝", "積木", "奶瓶", "布偶", "繪本", "嬰兒推車", "巧拼地墊"], tags: ["育兒", "兒童", "嬰兒", "玩具"] },
  { id: 9, nouns: ["手機", "平板", "筆電", "桌機", "螢幕", "鍵盤", "滑鼠", "耳機", "喇叭", "相機"], tags: ["3C", "電子", "電腦", "周邊"] },
  { id: 10, nouns: ["吉他", "電子琴", "音響", "麥克風", "藍光播放器", "黑膠唱片", "遊戲機", "遊戲片"], tags: ["影音", "樂器", "遊戲", "娛樂"] },
];

/** 依 MegaWeaving 物品類型粗估的分類分佈，生活居家類最多 */
export const CATEGORY_WEIGHTS: readonly (readonly [number, number])[] = [
  [7, 22], [1, 12], [6, 12], [8, 10], [5, 10], [9, 9], [3, 7], [2, 6], [10, 6], [4, 6],
];

export const GENERIC_TAGS = ["免費", "自取", "急送", "九成新", "可議", "近捷運", "限面交", "二手"] as const;

export interface District {
  province: string;
  city: string;
  zip: string;
  lat: number;
  lng: number;
  weight: number;
}

export const DISTRICTS: readonly District[] = [
  { province: "臺北市", city: "大安區", zip: "106", lat: 25.0264, lng: 121.5436, weight: 8 },
  { province: "臺北市", city: "中正區", zip: "100", lat: 25.0324, lng: 121.5199, weight: 5 },
  { province: "臺北市", city: "信義區", zip: "110", lat: 25.033, lng: 121.5654, weight: 6 },
  { province: "臺北市", city: "中山區", zip: "104", lat: 25.0685, lng: 121.5264, weight: 6 },
  { province: "臺北市", city: "內湖區", zip: "114", lat: 25.083, lng: 121.587, weight: 5 },
  { province: "臺北市", city: "士林區", zip: "111", lat: 25.093, lng: 121.525, weight: 4 },
  { province: "新北市", city: "板橋區", zip: "220", lat: 25.0115, lng: 121.4627, weight: 6 },
  { province: "新北市", city: "新莊區", zip: "242", lat: 25.0359, lng: 121.45, weight: 4 },
  { province: "新北市", city: "中和區", zip: "235", lat: 24.9994, lng: 121.499, weight: 4 },
  { province: "新北市", city: "三重區", zip: "241", lat: 25.0615, lng: 121.487, weight: 4 },
  { province: "新北市", city: "新店區", zip: "231", lat: 24.9676, lng: 121.5419, weight: 3 },
  { province: "新北市", city: "淡水區", zip: "251", lat: 25.1697, lng: 121.441, weight: 2 },
  { province: "桃園市", city: "桃園區", zip: "330", lat: 24.9936, lng: 121.301, weight: 3 },
  { province: "桃園市", city: "中壢區", zip: "320", lat: 24.9653, lng: 121.225, weight: 3 },
  { province: "新竹市", city: "東區", zip: "300", lat: 24.8039, lng: 120.9714, weight: 2 },
  { province: "臺中市", city: "西屯區", zip: "407", lat: 24.1814, lng: 120.6446, weight: 3 },
  { province: "臺中市", city: "北區", zip: "404", lat: 24.1577, lng: 120.6823, weight: 2 },
  { province: "臺中市", city: "南屯區", zip: "408", lat: 24.1377, lng: 120.6435, weight: 2 },
  { province: "臺南市", city: "東區", zip: "701", lat: 22.9807, lng: 120.2244, weight: 2 },
  { province: "臺南市", city: "中西區", zip: "700", lat: 22.992, lng: 120.1966, weight: 1 },
  { province: "高雄市", city: "前鎮區", zip: "806", lat: 22.5957, lng: 120.3084, weight: 2 },
  { province: "高雄市", city: "左營區", zip: "813", lat: 22.6868, lng: 120.2946, weight: 2 },
  { province: "高雄市", city: "三民區", zip: "807", lat: 22.6464, lng: 120.3223, weight: 2 },
  { province: "宜蘭縣", city: "宜蘭市", zip: "260", lat: 24.7527, lng: 121.7535, weight: 1 },
  { province: "花蓮縣", city: "花蓮市", zip: "970", lat: 23.9771, lng: 121.6044, weight: 1 },
];

export const TITLE_PREFIX = {
  share: ["【分享】", "【送】", "【免費送】", ""],
  wish: ["【徵求】", "【求】", "【許願】"],
  commons: ["【共享】", "【可借用】", "【公用】"],
} as const;

export const CONDITION_WORDS = ["全新", "九成新", "八成新", "堪用", "需維修"] as const;

export const QUANTITY_WORDS = ["一批", "一組", "多件", "可分開索取", "數量有限"] as const;

export const CONTENT_SENTENCES = [
  "因為搬家整理出來，希望給需要的人。",
  "使用不到一年，功能都正常。",
  "外觀有些微使用痕跡，不影響使用。",
  "可以約平日晚上或週末面交。",
  "請私訊告知需要的原因，會優先給需要的人。",
  "東西有點重，建議開車來載。",
  "原本買來備用，結果一直沒有用到。",
  "有附原廠盒子與說明書。",
  "希望可以送給會好好使用的人。",
  "如果有人需要也可以一起帶走其他物品。",
  "家裡小朋友長大了用不到。",
  "請自備袋子，現場可以先試用。",
  "放在社區管理室，約好時間即可領取。",
  "已經清潔過，可以直接使用。",
  "若有興趣請留言，先留言先詢問。",
] as const;

export const COMMENT_SENTENCES = [
  "請問還在嗎？",
  "想詢問可以週末面交嗎？",
  "謝謝分享，已私訊。",
  "請問尺寸大概多大？",
  "好心人一生平安！",
  "我家很需要，希望有機會。",
  "請問可以寄送嗎？",
  "已領取，非常感謝！",
] as const;

export const IMAGE_SIZES: readonly (readonly [number, number])[] = [
  [1080, 1080], [1080, 1350], [1350, 1080], [1200, 900], [900, 1200],
];
