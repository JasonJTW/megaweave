// server/src/scripts/checkEmissionFactors.ts
// 對照環境部碳足跡排放係數資料庫（CFP_P_02）開放資料 API，檢查 factorTable.ts 引用的
// 環境部記錄是否仍存在、數值未變，並列出同名但公告年較新的記錄（審查 SOP 要求優先引用較新係數）。
//
//   cd server && MOENV_API_KEY=<key> npm run check:emission-factors
//
// API key 在 https://data.moenv.gov.tw 註冊會員後申請；每日呼叫上限 5000 次（共用 key 常被用完）。
// 結束碼：0 = 全部一致；1 = 有記錄消失或數值改變；有較新記錄只警告不失敗。

import { z } from "zod";
import {
  MATERIAL_FACTORS,
  MATERIAL_IDS,
} from "../services/avoidedEmissions/factorTable";

const API_URL = "https://data.moenv.gov.tw/api/v2/cfp_p_02";
const PAGE_SIZE = 1000;

const recordSchema = z.object({
  name: z.string(),
  coe: z.string(),
  unit: z.string(),
  departmentname: z.string(),
  announcementyear: z.string(),
});

type MoenvRecord = z.infer<typeof recordSchema>;

async function fetchAll(apiKey: string): Promise<MoenvRecord[]> {
  const records: MoenvRecord[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${API_URL}?api_key=${encodeURIComponent(apiKey)}&limit=${PAGE_SIZE}&offset=${offset}&format=JSON`;
    const response = await fetch(url);
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `MOENV API HTTP ${response.status}: ${body.slice(0, 200)}`,
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // 額度用完時回 200 + 純文字訊息
      throw new Error(`MOENV API returned non-JSON: ${body.slice(0, 200)}`);
    }
    const page = z.array(recordSchema).parse(parsed);
    records.push(...page);
    if (page.length < PAGE_SIZE) return records;
  }
}

async function main(): Promise<number> {
  const apiKey = z
    .string()
    .min(1, "MOENV_API_KEY is required")
    .parse(process.env.MOENV_API_KEY);

  const records = await fetchAll(apiKey);
  console.log(`Fetched ${records.length} CFP_P_02 records`);

  let failures = 0;
  for (const id of MATERIAL_IDS) {
    const ref = MATERIAL_FACTORS[id].moenvRecord;
    const label = `${id} → ${ref.name}（${ref.announcementYear}）`;
    const sameName = records.filter((r) => r.name === ref.name);
    const exact = sameName.filter(
      (r) => r.announcementyear === ref.announcementYear,
    );

    if (exact.length !== 1) {
      failures += 1;
      console.error(`✗ ${label}: found ${exact.length} matching records`);
    } else if (exact[0].coe !== ref.coe || exact[0].unit !== ref.unit) {
      failures += 1;
      console.error(
        `✗ ${label}: API has ${exact[0].coe} ${exact[0].unit}, table has ${ref.coe} ${ref.unit}`,
      );
    } else {
      console.log(`✓ ${label}: ${ref.coe} ${ref.unit}`);
    }

    for (const newer of sameName.filter(
      (r) => Number(r.announcementyear) > Number(ref.announcementYear),
    )) {
      console.warn(
        `! ${label}: newer record ${newer.announcementyear} = ${newer.coe} ${newer.unit}（${newer.departmentname}）`,
      );
    }
  }
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
