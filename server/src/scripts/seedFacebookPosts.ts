// server/src/scripts/seedFacebookPosts.ts

/*
 //* Command to run:
 //* cd server
 //* npm run dev
 //* npx ts-node --transpile-only src/scripts/seedFacebookPosts.ts ~/megaweavingFB/posts.json
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load development environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.development") });

import { postService } from "../services/postService";
import type { PostType } from "../types/post";
import dbPool from "../utils/db";
import { RowDataPacket } from "mysql2";
import { connectRedis, disconnectRedis } from "../utils/redis";
import { defaultImageStorage } from "../storage/ImageStorage";

interface RawLocation {
  query?: string;
  place_id?: string;
  name?: string | null;
  url?: string | null;
  full_address?: string;
  province?: string | null;
  city?: string | null;
  route?: string | null;
  zip?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface RawPost {
  title?: string;
  content?: string;
  type?: string;
  category_id?: number | string;
  condition_level?: number | string;
  location?: RawLocation;
  images?: string[];
  [key: string]: unknown;
}

const BOT_USER_ID = 2; // MegaBot default ID

/**
 * Resolves the absolute path to an image file.
 * Checks relative to posts directory first, then as-is.
 */
function resolveImagePath(
  imgPath: string,
  postsDir: string,
): string | null {
  const candidate1 = path.resolve(postsDir, imgPath);
  if (fs.existsSync(candidate1)) return candidate1;

  const candidate2 = path.resolve(imgPath);
  if (fs.existsSync(candidate2)) return candidate2;

  return null;
}

/**
 * Validates whether a category ID exists and is active.
 */
async function isValidCategory(categoryId: number): Promise<boolean> {
  const [rows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT id FROM categories WHERE id = ? AND status = 'active'",
    [categoryId],
  );
  return rows.length > 0;
}

/**
 * Validates condition level (must be integer between 1 and 5).
 */
function isValidConditionLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= 5;
}

/**
 * Validates post type (must be 'share', 'wish', or 'commons').
 */
function isValidPostType(type: string): type is PostType {
  return ["share", "wish", "commons"].includes(type);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("❌ Please provide the path to posts.json");
    console.error(
      "   Usage: npx ts-node --transpile-only src/scripts/seedFacebookPosts.ts <path-to-json>",
    );
    process.exit(1);
  }

  const jsonFilePath = path.resolve(args[0]);
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ File not found: ${jsonFilePath}`);
    process.exit(1);
  }

  const postsDir = path.dirname(jsonFilePath);

  console.log(`\n📦 Loading seed data from: ${jsonFilePath}`);
  console.log(`📂 Image search directory: ${postsDir}`);

  let rawData: unknown;
  try {
    const fileContent = fs.readFileSync(jsonFilePath, "utf-8");
    rawData = JSON.parse(fileContent);
  } catch (err) {
    console.error("❌ Failed to parse JSON file:", err);
    process.exit(1);
  }

  if (!Array.isArray(rawData)) {
    console.error("❌ JSON root must be an array of posts");
    process.exit(1);
  }

  const posts: RawPost[] = rawData;
  console.log(`📊 Found ${posts.length} posts to process\n`);

  // Verify MegaBot user exists
  const [botRows] = await dbPool.execute<RowDataPacket[]>(
    "SELECT id, username FROM users WHERE id = ?",
    [BOT_USER_ID],
  );
  if (botRows.length === 0) {
    console.error(
      `❌ MegaBot user (ID: ${BOT_USER_ID}) does not exist in the database!`,
    );
    console.error(
      "   Please ensure the bot user is created before running this script.",
    );
    process.exit(1);
  }
  console.log(`🤖 Seeding as user: ${botRows[0].username} (ID: ${BOT_USER_ID})\n`);

  // Connect Redis for hotScore calculation in postService
  try {
    await connectRedis();
  } catch (redisErr) {
    console.warn(
      "⚠️ Could not connect to Redis, hotScore caching may fail silently:",
      redisErr,
    );
  }

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const postNum = i + 1;
    console.log(
      `------------------------------------------------------------`,
    );
    console.log(
      `[${postNum}/${posts.length}] Processing: "${post.title || "Untitled"}"`,
    );

    try {
      // 1. Validate required text fields
      const title = (post.title || "").trim();
      const content = (post.content || "").trim();

      if (title.length < 5 || title.length > 60) {
        console.warn(
          `  ⚠️ Skipped: Title length (${title.length}) outside allowed range [5, 60]`,
        );
        skippedCount++;
        continue;
      }

      if (content.length < 3 || content.length > 1000) {
        console.warn(
          `  ⚠️ Skipped: Content length (${content.length}) outside allowed range [3, 1000]`,
        );
        skippedCount++;
        continue;
      }

      // 2. Validate Post Type
      const type = post.type || "share";
      if (!isValidPostType(type)) {
        console.warn(`  ⚠️ Skipped: Invalid post type "${type}"`);
        skippedCount++;
        continue;
      }

      // 3. Validate Category ID
      const categoryId = Number(post.category_id) || 1;
      const categoryValid = await isValidCategory(categoryId);
      if (!categoryValid) {
        console.warn(`  ⚠️ Skipped: Category ID ${categoryId} is invalid or inactive`);
        skippedCount++;
        continue;
      }

      // 4. Validate Condition Level
      const conditionLevel = Number(post.condition_level) || 3;
      if (!isValidConditionLevel(conditionLevel)) {
        console.warn(
          `  ⚠️ Skipped: Invalid condition level ${conditionLevel} (must be 1-5)`,
        );
        skippedCount++;
        continue;
      }

      // 5. Image handling: Upload to staging S3
      const stagingKeys: string[] = [];
      if (Array.isArray(post.images) && post.images.length > 0) {
        for (const imgRelPath of post.images) {
          const srcPath = resolveImagePath(imgRelPath, postsDir);
          if (!srcPath) {
            console.warn(`  ⚠️ Image file not found: ${imgRelPath}`);
            continue;
          }

          try {
            const tempFileName = `fb_seed_${Date.now()}_${Math.random().toString(36).slice(2)}_${path.basename(srcPath)}`;
            const stagingKey = `staging/posts/${tempFileName}`;
            const fileBuf = await fs.promises.readFile(srcPath);
            await defaultImageStorage.upload(fileBuf, "staging/posts", tempFileName, "image/jpeg");
            stagingKeys.push(stagingKey);
          } catch (copyErr) {
            console.error(
              `  ⚠️ Failed to stage image (${srcPath}):`,
              copyErr,
            );
          }
        }
      }

      // Calculate expiration date (+14 days from execution time)
      const expiresAt = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString();

      try {
        // Extract location data if present
        const locationData = post.location
          ? {
              place_id: post.location.place_id,
              location_name: post.location.name || undefined,
              location_url: post.location.url || undefined,
              full_address: post.location.full_address,
              province: post.location.province || undefined,
              city: post.location.city || undefined,
              route: post.location.route || undefined,
              zip: post.location.zip || undefined,
              lat:
                post.location.lat !== null && post.location.lat !== undefined
                  ? Number(post.location.lat)
                  : undefined,
              lng:
                post.location.lng !== null && post.location.lng !== undefined
                  ? Number(post.location.lng)
                  : undefined,
            }
          : {};

        // Directly call postService.createPost
        const createdPost = await postService.createPost(
          BOT_USER_ID,
          {
            title,
            content,
            type,
            categoryId,
            conditionLevel,
            status: "active",
            expiresAt,
            stagingKeys,
            ...locationData,
          },
        );

        console.log(`  ✅ Successfully created post ID: ${createdPost.id}`);
        console.log(`     Title: ${title}`);
        console.log(`     Type: ${type}, Category: ${categoryId}`);
        if (stagingKeys.length > 0) {
          console.log(`     Images: ${stagingKeys.length} staged for worker upload`);
        }
        successCount++;
      } catch (err) {
        console.error(`  ❌ Failed to create post:`, err);
        failedCount++;
      }
    } catch (loopErr) {
      console.error(`  ❌ Unexpected error on post [${postNum}]:`, loopErr);
      failedCount++;
    }
  }

  console.log(`\n============================================================`);
  console.log(`🎉 Seeding complete!`);
  console.log(`   ✅ Succeeded: ${successCount}`);
  console.log(`   ⚠️ Skipped:   ${skippedCount}`);
  console.log(`   ❌ Failed:    ${failedCount}`);
  console.log(`============================================================\n`);

  try {
    await disconnectRedis();
  } catch {
    // Ignore redis disconnect errors on exit
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
