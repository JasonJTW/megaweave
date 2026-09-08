import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import dbPool, { closeDatabase } from "../utils/db";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";

// 載入環境變數
const envPath = path.resolve(__dirname, "../../.env.development");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// 取得 Google Maps API Key（支援從 client/.env.development 讀取）
function getGoogleMapsApiKey(): string | undefined {
  if (process.env.GOOGLE_MAPS_API_KEY) {
    return process.env.GOOGLE_MAPS_API_KEY;
  }
  if (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  }

  const clientEnvPath = path.resolve(__dirname, "../../../client/.env.development");
  if (fs.existsSync(clientEnvPath)) {
    const lines = fs.readFileSync(clientEnvPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=")) {
        return trimmed.slice("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=".length).trim();
      }
    }
  }
  return undefined;
}

interface LocationRow extends RowDataPacket {
  id: number;
  place_id: string | null;
  name: string | null;
  full_address: string;
  lat: string | null;
  lng: string | null;
  url: string | null;
}

async function fetchGooglePlaceUrl(placeId: string, apiKey: string): Promise<string | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
      placeId,
    )}&fields=url,name&language=zh-TW&key=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status: string;
      result?: { url?: string; name?: string };
    };

    if (data.status === "OK" && data.result?.url) {
      return data.result.url;
    }
    return null;
  } catch (err) {
    console.error(`[Error] Failed to fetch Place Details for place_id ${placeId}:`, err);
    return null;
  }
}

function generateFallbackUrl(row: LocationRow): string {
  if (row.place_id && !row.place_id.startsWith("manual:")) {
    const query = encodeURIComponent(row.full_address || row.name || "");
    return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(
      row.place_id,
    )}`;
  }
  if (row.lat && row.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${row.lat},${row.lng}`,
    )}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    row.full_address || "",
  )}`;
}

async function main() {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    console.warn("⚠️ Warning: No Google Maps API key found, fallback URLs will be generated.");
  }

  console.log("🔍 Checking locations with missing URL...");

  const [rows] = await dbPool.execute<LocationRow[]>(
    "SELECT id, place_id, name, full_address, lat, lng, url FROM locations WHERE url IS NULL OR url = ''",
  );

  console.log(`📋 Found ${rows.length} location(s) missing URL.`);

  if (rows.length === 0) {
    console.log("✅ All locations already have URLs. Nothing to do.");
    await closeDatabase();
    process.exit(0);
  }

  let updatedCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    let resolvedUrl: string | null = null;

    if (apiKey && row.place_id && !row.place_id.startsWith("manual:")) {
      resolvedUrl = await fetchGooglePlaceUrl(row.place_id, apiKey);
    }

    if (!resolvedUrl) {
      resolvedUrl = generateFallbackUrl(row);
    }

    if (resolvedUrl) {
      try {
        await dbPool.execute<ResultSetHeader>(
          "UPDATE locations SET url = ? WHERE id = ?",
          [resolvedUrl, row.id],
        );
        updatedCount++;
        console.log(`[${updatedCount}/${rows.length}] Updated ID ${row.id}: ${resolvedUrl}`);
      } catch (err) {
        failedCount++;
        console.error(`❌ Failed to update location ID ${row.id}:`, err);
      }
    } else {
      failedCount++;
      console.warn(`⚠️ Could not generate URL for location ID ${row.id}`);
    }

    // Rate-limiting delay to avoid hitting Google API limits too fast
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  console.log("\n================ Summary ================");
  console.log(`Total scanned: ${rows.length}`);
  console.log(`Successfully updated: ${updatedCount}`);
  console.log(`Failed: ${failedCount}`);

  const [verifyRows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT count(*) AS count FROM locations WHERE url IS NULL OR url = ''",
  );
  console.log(`Remaining locations without URL: ${(verifyRows[0] as { count: number }).count}`);

  await closeDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal error running backfillLocationUrls:", err);
  await closeDatabase();
  process.exit(1);
});
